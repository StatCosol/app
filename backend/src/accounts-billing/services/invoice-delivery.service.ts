import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { InvoiceEmailLog } from '../entities/invoice-email-log.entity';
import { SendInvoiceEmailDto } from '../dto/email.dto';

export interface InvoiceDelivery {
  id: string;
  invoice_id: string;
  request_id: string;
  fingerprint: string;
  pdf_path: string | null;
  status:
    | 'PREPARING'
    | 'SENDING'
    | 'UNKNOWN'
    | 'ACCEPTED'
    | 'RECONCILED'
    | 'NOT_SENT';
  message_id: string | null;
  accepted_at: Date | null;
}

@Injectable()
export class InvoiceDeliveryService {
  private readonly logger = new Logger(InvoiceDeliveryService.name);
  constructor(private readonly ds: DataSource) {}

  fingerprint(dto: SendInvoiceEmailDto) {
    return createHash('sha256')
      .update(
        JSON.stringify([
          dto.toEmail,
          dto.ccEmail || '',
          dto.bccEmail || '',
          dto.subject || '',
          dto.body || '',
        ]),
      )
      .digest('hex');
  }

  async existing(invoiceId: string, requestId: string, fingerprint: string) {
    const [job]: InvoiceDelivery[] = await this.ds.query(
      'SELECT * FROM invoice_deliveries WHERE invoice_id=$1 AND request_id=$2',
      [invoiceId, requestId],
    );
    if (job && job.fingerprint !== fingerprint)
      throw new ConflictException(
        'This send request has changed. Reopen the email form to send a new message.',
      );
    return job;
  }

  async begin(
    invoiceId: string,
    requestId: string,
    fingerprint: string,
    input: Partial<InvoiceEmailLog>,
  ) {
    return this.ds.transaction(async (manager) => {
      const [invoice] = await manager.query(
        'SELECT id, pdf_path, invoice_status FROM invoices WHERE id=$1 FOR UPDATE',
        [invoiceId],
      );
      if (!invoice) throw new NotFoundException('Invoice not found');
      const [existing]: InvoiceDelivery[] = await manager.query(
        'SELECT * FROM invoice_deliveries WHERE invoice_id=$1 AND request_id=$2',
        [invoiceId, requestId],
      );
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException(
            'This send request has changed. Reopen the email form.',
          );
        return { job: existing, claimed: false };
      }
      if (invoice.invoice_status === 'CANCELLED')
        throw new ConflictException('Cancelled invoices cannot be emailed.');
      const pending = await manager.query(
        "SELECT id FROM invoice_deliveries WHERE invoice_id=$1 AND status IN ('PREPARING','SENDING','UNKNOWN','ACCEPTED')",
        [invoiceId],
      );
      if (pending.length)
        throw new ConflictException(
          'An earlier delivery is pending or uncertain. Do not resend; review Email Logs with an administrator.',
        );
      const repo = manager.getRepository(InvoiceEmailLog);
      const log = await repo.save(repo.create(input));
      const [job]: InvoiceDelivery[] = await manager.query(
        `INSERT INTO invoice_deliveries(id,invoice_id,request_id,fingerprint,status)
         VALUES($1,$2,$3,$4,'PREPARING') RETURNING *`,
        [log.id, invoiceId, requestId, fingerprint],
      );
      return { job, claimed: true };
    });
  }

  async start(
    job: InvoiceDelivery,
    pdfPath: string,
    subject: string,
    body: string,
  ) {
    await this.ds.transaction(async (manager) => {
      const [invoice] = await manager.query(
        'SELECT pdf_path,invoice_status FROM invoices WHERE id=$1 FOR UPDATE',
        [job.invoice_id],
      );
      if (
        !invoice ||
        invoice.invoice_status === 'CANCELLED' ||
        invoice.pdf_path !== pdfPath
      )
        throw new ConflictException(
          'The invoice changed during preparation. Refresh before sending.',
        );
      const [current] = await manager.query(
        "SELECT id FROM invoice_deliveries WHERE id=$1 AND status='PREPARING' FOR UPDATE",
        [job.id],
      );
      if (!current)
        throw new ConflictException(
          'Email preparation expired or changed. Review Email Logs before retrying.',
        );
      await manager.query(
        'UPDATE invoice_email_logs SET subject=$2,body=$3 WHERE id=$1',
        [job.id, subject, body],
      );
      await manager.query(
        "UPDATE invoice_deliveries SET status='SENDING',pdf_path=$2,updated_at=now() WHERE id=$1",
        [job.id, pdfPath],
      );
    });
  }

  async preparationFailed(id: string) {
    await this.ds.query(
      `WITH changed AS (UPDATE invoice_deliveries SET status='NOT_SENT',updated_at=now()
      WHERE id=$1 AND status='PREPARING' RETURNING id)
      UPDATE invoice_email_logs SET sent_status='FAILED',failure_reason='Email preparation did not complete. No send was initiated.'
      WHERE id IN (SELECT id FROM changed)`,
      [id],
    );
  }

  result(this: void, job: InvoiceDelivery) {
    if (job.status === 'ACCEPTED' || job.status === 'RECONCILED')
      return {
        success: true as const,
        messageId: job.message_id || undefined,
        ...(job.status === 'ACCEPTED'
          ? {
              statusUpdatePending: true,
              warning:
                'Email accepted; saved status is pending reconciliation. Do not resend.',
            }
          : {}),
      };
    return {
      success: false as const,
      error:
        job.status === 'NOT_SENT'
          ? 'This attempt was confirmed not sent. Reopen the email form for a new attempt.'
          : 'Delivery is pending or uncertain. Do not resend; ask an administrator to review Email Logs.',
    };
  }

  async accepted(id: string, messageId?: string) {
    // Persist the receipt before bookkeeping. If this write itself is lost, the
    // pre-send record remains SENDING/UNKNOWN and blocks an unsafe resend.
    const rows = await this.ds.query(
      `WITH changed AS (UPDATE invoice_deliveries SET status='ACCEPTED',message_id=$2,accepted_at=now(),updated_at=now()
       WHERE id=$1 AND status IN ('SENDING','UNKNOWN') RETURNING id) SELECT id FROM changed`,
      [id, messageId || null],
    );
    if (!rows.length)
      throw new ConflictException(
        'Delivery state changed; administrator review required.',
      );
    await this.reconcile(id);
  }

  async uncertain(id: string, definitelyNotSent = false) {
    await this.ds.transaction(async (manager) => {
      await manager.query(
        `WITH changed AS (UPDATE invoice_deliveries SET status=$2,updated_at=now() WHERE id=$1 AND status='SENDING' RETURNING id)
         UPDATE invoice_email_logs SET failure_reason=$3, sent_status=$4 WHERE id IN (SELECT id FROM changed)`,
        [
          id,
          definitelyNotSent ? 'NOT_SENT' : 'UNKNOWN',
          definitelyNotSent
            ? 'Email delivery is disabled. Message was not sent.'
            : 'Delivery outcome uncertain. Do not resend before provider verification.',
          definitelyNotSent ? 'FAILED' : 'NOT_SENT',
        ],
      );
    });
  }

  async reconcile(id: string) {
    const [candidate]: InvoiceDelivery[] = await this.ds.query(
      'SELECT * FROM invoice_deliveries WHERE id=$1',
      [id],
    );
    if (!candidate) return;
    await this.ds.transaction(async (manager) => {
      // Same invoice-first order as sends and invoice edits.
      const [invoice] = await manager.query(
        'SELECT id FROM invoices WHERE id=$1 FOR UPDATE',
        [candidate.invoice_id],
      );
      if (!invoice) return;
      const [job]: InvoiceDelivery[] = await manager.query(
        "SELECT * FROM invoice_deliveries WHERE id=$1 AND status='ACCEPTED' FOR UPDATE",
        [id],
      );
      if (job) await this.applyReceipt(manager, job);
    });
  }

  private async applyReceipt(manager: EntityManager, job: InvoiceDelivery) {
    await manager.query(
      "UPDATE invoice_email_logs SET sent_status='SENT',sent_at=$2,failure_reason=NULL WHERE id=$1",
      [job.id, job.accepted_at],
    );
    // An old receipt must not mark a newly edited invoice as emailed.
    await manager.query(
      "UPDATE invoices SET mail_status='SENT' WHERE id=$1 AND pdf_path=$2 AND invoice_status <> 'CANCELLED'",
      [job.invoice_id, job.pdf_path],
    );
    await manager.query(
      "UPDATE invoice_deliveries SET status='RECONCILED',updated_at=now() WHERE id=$1",
      [job.id],
    );
  }

  async recover() {
    await this.ds
      .query(`WITH expired AS (UPDATE invoice_deliveries SET status='NOT_SENT',updated_at=now()
      WHERE status='PREPARING' AND updated_at < now() - interval '30 minutes' RETURNING id)
      UPDATE invoice_email_logs SET sent_status='FAILED',failure_reason='Email preparation expired. No send was initiated.' WHERE id IN (SELECT id FROM expired)`);
    await this.ds.query(
      "UPDATE invoice_deliveries SET status='UNKNOWN',updated_at=now() WHERE status='SENDING' AND updated_at < now() - interval '30 minutes'",
    );
    const rows = await this.ds.query(
      "SELECT id FROM invoice_deliveries WHERE status='ACCEPTED' ORDER BY updated_at,id LIMIT 25",
    );
    for (const row of rows) {
      try {
        await this.reconcile(row.id);
      } catch {
        // Move failed receipts behind the remaining queue, without changing
        // their outcome or allowing a resend.
        await this.ds.query(
          "UPDATE invoice_deliveries SET updated_at=now() WHERE id=$1 AND status='ACCEPTED'",
          [row.id],
        );
        this.logger.warn({
          event: 'INVOICE_RECEIPT_RETRY',
          deliveryId: row.id,
        });
      }
    }
  }

  async details(ids: string[]) {
    if (!ids.length) return [];
    return this.ds.query(
      `SELECT id,status,message_id AS "messageId",accepted_at AS "acceptedAt",
      resolution_note AS "resolutionNote" FROM invoice_deliveries WHERE id=ANY($1::uuid[])`,
      [ids],
    );
  }

  async resolve(
    user: { roleCode?: string; userId?: string; id?: string },
    id: string,
    outcome: 'SENT' | 'NOT_SENT',
    note: string,
    providerVerified: boolean,
  ) {
    if (user?.roleCode !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    if (
      providerVerified !== true ||
      !['SENT', 'NOT_SENT'].includes(outcome) ||
      typeof note !== 'string' ||
      note.trim().length < 10 ||
      note.trim().length > 2000
    )
      throw new BadRequestException(
        'A verified provider outcome and evidence of 10 to 2000 characters are required',
      );
    const [candidate]: InvoiceDelivery[] = await this.ds.query(
      'SELECT * FROM invoice_deliveries WHERE id=$1',
      [id],
    );
    if (!candidate) throw new NotFoundException('Delivery record not found');
    return this.ds.transaction(async (manager) => {
      await manager.query('SELECT id FROM invoices WHERE id=$1 FOR UPDATE', [
        candidate.invoice_id,
      ]);
      const [job]: InvoiceDelivery[] = await manager.query(
        "SELECT * FROM invoice_deliveries WHERE id=$1 AND status='UNKNOWN' FOR UPDATE",
        [id],
      );
      if (!job)
        throw new ConflictException(
          'Only uncertain deliveries can be resolved. Refresh Email Logs.',
        );
      await manager.query(
        `UPDATE invoice_deliveries SET status=$2::varchar,resolved_by=$3,resolution_note=$4,
        accepted_at=CASE WHEN $2::varchar='ACCEPTED' THEN COALESCE(accepted_at,now()) ELSE accepted_at END,updated_at=now() WHERE id=$1`,
        [
          id,
          outcome === 'SENT' ? 'ACCEPTED' : 'NOT_SENT',
          user.userId || user.id,
          note,
        ],
      );
      await manager.query(
        `INSERT INTO invoice_audit_logs(invoice_id,action,changed_by,payload)
        VALUES($1,'EMAIL_DELIVERY_RESOLVED',$2,$3::jsonb)`,
        [
          job.invoice_id,
          user.userId || user.id,
          JSON.stringify({ deliveryId: id, outcome, providerEvidence: note }),
        ],
      );
      if (outcome === 'SENT')
        await this.applyReceipt(manager, {
          ...job,
          accepted_at: job.accepted_at || new Date(),
        });
      else
        await manager.query(
          "UPDATE invoice_email_logs SET sent_status='FAILED',failure_reason='Administrator confirmed not sent after provider review.' WHERE id=$1",
          [id],
        );
      return { success: true };
    });
  }
}
