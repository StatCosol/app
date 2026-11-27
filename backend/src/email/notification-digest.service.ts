import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { operationalDate } from '../common/operational-date';
import {
  DigestInput,
  DigestItem,
  digestDate,
  digestEventKey,
  digestReady,
  digestRecipients,
  renderDigest,
} from './notification-digest';

type SendResult = {
  ok?: boolean;
  error?: string;
  skipped?: boolean;
  messageId?: string;
};
export type DigestSender = (
  to: string,
  subject: string,
  body: string,
) => Promise<SendResult>;

@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);
  constructor(private readonly db: DataSource) {}

  async enqueue(input: DigestInput, now = new Date()) {
    const recipients = digestRecipients(input);
    const day = digestDate(now);
    const key = digestEventKey(input, day);
    return this.db.transaction(async (manager) => {
      const [event] = await manager.query(
        `INSERT INTO notification_email_events(event_key,category,subject,title,body_html,available_on)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO UPDATE SET event_key=EXCLUDED.event_key RETURNING id`,
        [key, input.category, input.subject, input.title, input.bodyHtml, day],
      );
      await manager.query(
        `INSERT INTO notification_email_recipients(event_id,recipient)
         SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [event.id, recipients],
      );
      return {
        ok: true as const,
        queued: true as const,
        digestEventId: event.id as string,
        availableOn: day,
      };
    });
  }

  async flush(send: DigestSender, now = new Date()) {
    await this.reconcile();
    if (!digestReady(now)) return { sent: 0, unknown: 0 };
    const day = operationalDate(now);
    const recipients: Array<{ recipient: string }> = await this.db.query(
      `SELECT DISTINCT r.recipient FROM notification_email_recipients r
       JOIN notification_email_events e ON e.id=r.event_id
       WHERE r.digest_id IS NULL AND e.available_on <= $1::date
       AND NOT EXISTS(SELECT 1 FROM notification_email_digests d WHERE d.recipient=r.recipient AND d.delivery_date=$1::date)
       ORDER BY r.recipient`,
      [day],
    );
    let sent = 0,
      unknown = 0;
    for (const { recipient } of recipients) {
      const claim = await this.db.transaction(async (manager) => {
        const rows = await manager.query(
          `INSERT INTO notification_email_digests(recipient,delivery_date,status) VALUES($1,$2,'SENDING')
           ON CONFLICT(recipient,delivery_date) DO NOTHING RETURNING id`,
          [recipient, day],
        );
        if (!rows.length) return null;
        const id = rows[0].id as string;
        const items: DigestItem[] = await manager.query(
          `WITH claimed AS (UPDATE notification_email_recipients r SET digest_id=$1
           FROM notification_email_events e WHERE e.id=r.event_id AND r.recipient=$2 AND r.digest_id IS NULL
           AND e.available_on <= $3::date RETURNING r.event_id)
           SELECT e.* FROM notification_email_events e JOIN claimed c ON c.event_id=e.id ORDER BY e.created_at,e.id`,
          [id, recipient, day],
        );
        if (!items.length) throw new Error('Digest claim has no items');
        return { id, items };
      });
      if (!claim) continue;
      // Commit the reservation before SMTP. A crash or uncertain SMTP response
      // must NEVER release it for automatic resend (the server may have accepted it).
      try {
        const result = await send(
          recipient,
          `StatCo daily summary — ${day} — ${claim.items.length} updates`,
          renderDigest(claim.items, day),
        );
        if (!result.ok)
          throw new Error(result.error || 'SMTP delivery not confirmed');
        await this.db.query(
          `UPDATE notification_email_digests SET status='SENT',sent_at=now(),message_id=$2 WHERE id=$1 AND status='SENDING'`,
          [claim.id, result.messageId || null],
        );
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.db.query(
          `UPDATE notification_email_digests SET status='UNKNOWN',error_message=$2 WHERE id=$1 AND status='SENDING'`,
          [claim.id, message.slice(0, 1500)],
        );
        this.logger.error(
          `Digest ${claim.id}: delivery needs review; automatic resend blocked`,
        );
        unknown++;
      }
    }
    await this.reconcile();
    return { sent, unknown };
  }

  async reconcile() {
    // A process crash leaves an explicitly uncertain reservation, not a retryable message.
    await this.db
      .query(`UPDATE notification_email_digests SET status='UNKNOWN',error_message='Sender stopped before delivery confirmation; review before any resend'
      WHERE status='SENDING' AND claimed_at < now()-interval '30 minutes'`);
    await this.db.transaction(async (manager) => {
      const state = `WITH pending_events AS (
        SELECT digest_event_id AS id FROM client_monthly_comm_runs WHERE status='QUEUED' AND digest_event_id IS NOT NULL
        UNION SELECT digest_event_id FROM registration_alerts WHERE NOT emailed AND digest_event_id IS NOT NULL
        UNION SELECT digest_event_id FROM invoice_email_logs WHERE sent_status::text='QUEUED' AND digest_event_id IS NOT NULL
        UNION SELECT (summary->>'digestEventId')::uuid FROM admin_digest_runs WHERE status='QUEUED' AND summary->>'digestEventId' IS NOT NULL
      ), event_state AS (SELECT r.event_id,
        bool_and(d.status='SENT' AND d.id IS NOT NULL) AS sent,
        bool_or(d.status='UNKNOWN') AS uncertain,max(d.sent_at) AS sent_at
        FROM pending_events p JOIN notification_email_recipients r ON r.event_id=p.id
        LEFT JOIN notification_email_digests d ON d.id=r.digest_id GROUP BY r.event_id)`;
      await manager.query(`${state} UPDATE client_monthly_comm_runs c SET status=CASE WHEN s.sent THEN 'SENT' ELSE 'UNKNOWN' END,
        sent_at=CASE WHEN s.sent THEN s.sent_at ELSE NULL END,failure_reason=CASE WHEN s.sent THEN NULL ELSE 'Summary delivery not confirmed; automatic resend blocked' END
        FROM event_state s WHERE c.digest_event_id=s.event_id AND c.status='QUEUED' AND (s.sent OR s.uncertain)`);
      await manager.query(`${state} UPDATE registration_alerts a SET emailed=true,email_lease_until=NULL
        FROM event_state s WHERE a.digest_event_id=s.event_id AND NOT a.emailed AND s.sent`);
      await manager.query(`${state} UPDATE admin_digest_runs a SET status=CASE WHEN s.sent THEN 'SUCCESS' ELSE 'UNKNOWN' END,
        error_message=CASE WHEN s.sent THEN NULL ELSE 'Summary delivery not confirmed; automatic resend blocked' END
        FROM event_state s WHERE a.summary->>'digestEventId'=s.event_id::text AND a.status='QUEUED' AND (s.sent OR s.uncertain)`);
      // Enum-compatible updates are deliberately separate from the varchar logs above.
      await manager.query(`${state} UPDATE invoice_email_logs l SET sent_status='SENT',sent_at=s.sent_at,failure_reason=NULL
        FROM event_state s WHERE l.digest_event_id=s.event_id AND l.sent_status::text='QUEUED' AND s.sent`);
      await manager.query(`${state} UPDATE invoice_email_logs l SET sent_status='UNKNOWN',failure_reason='Summary delivery not confirmed; automatic resend blocked'
        FROM event_state s WHERE l.digest_event_id=s.event_id AND l.sent_status::text='QUEUED' AND s.uncertain AND NOT s.sent`);
      await manager.query(`WITH done AS (UPDATE invoice_email_logs SET digest_delivery_applied=true WHERE digest_event_id IS NOT NULL
        AND pending_payment_id IS NOT NULL AND sent_status::text='SENT' AND NOT digest_delivery_applied RETURNING pending_payment_id,sent_at),
        totals AS (SELECT pending_payment_id,count(*)::int AS n,max(sent_at) AS sent_at FROM done GROUP BY pending_payment_id)
        UPDATE pending_payment_followups p SET reminder_count=COALESCE(p.reminder_count,0)+t.n,last_reminder_sent_at=t.sent_at,
          last_reminder_status='SENT',last_failure_reason=NULL FROM totals t WHERE p.id=t.pending_payment_id`);
      await manager.query(`UPDATE pending_payment_followups p SET last_reminder_status='UNKNOWN',last_failure_reason='Summary delivery not confirmed; automatic resend blocked'
        WHERE p.last_reminder_status='QUEUED' AND EXISTS(SELECT 1 FROM invoice_email_logs l WHERE l.pending_payment_id=p.id
          AND l.digest_event_id IS NOT NULL AND l.sent_status::text='UNKNOWN' AND NOT l.digest_delivery_applied)`);
    });
  }
}
