import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { operationalDate } from '../common/operational-date';
import { EmailService } from '../email/email.service';
import {
  isFactoryLicence,
  manpowerPolicy,
  renewalPolicy,
} from './licence-alerts.policy';
import {
  DAILY_MANPOWER_SQL,
  LICENCE_RECIPIENTS_SQL,
  LICENCE_REGISTRATIONS_SQL,
} from './licence-alerts.sql';

interface LicenceRow {
  registrationId: string;
  clientId: string;
  branchId: string;
  branchName: string;
  clientName: string;
  type: string;
  registrationNumber: string | null;
  expiryDate: string | null;
  licensedWorkerLimit: number | null;
}

@Injectable()
export class LicenceAlertsService {
  private readonly logger = new Logger(LicenceAlertsService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly email: EmailService,
    private readonly access: AccessScopeService,
  ) {}

  async listForUser(user: ReqUser, branchId?: string) {
    const branches = await this.access.listAllowedBranches(user);
    const ids = branches.map((branch) => branch.id);
    if (branchId && !ids.includes(branchId))
      throw new ForbiddenException('Branch not allowed');
    return this.snapshot(branchId ? [branchId] : ids);
  }

  async snapshot(branchIds?: string[], today = operationalDate()) {
    if (branchIds && !branchIds.length)
      return { date: today, renewals: [], manpower: [] };
    const registrations: LicenceRow[] = await this.dataSource.query(
      LICENCE_REGISTRATIONS_SQL,
      [branchIds ?? null],
    );
    const factories = registrations.filter((reg) => isFactoryLicence(reg.type));
    const factoryBranches = [...new Set(factories.map((reg) => reg.branchId))];
    const counts: Array<{
      clientId: string;
      branchId: string;
      onRoll: number;
      contractor: number;
    }> = factoryBranches.length
      ? await this.dataSource.query(DAILY_MANPOWER_SQL, [
          factoryBranches,
          today,
        ])
      : [];
    const byBranch = new Map(
      counts.map((row) => [`${row.clientId}:${row.branchId}`, row]),
    );
    return {
      date: today,
      renewals: registrations
        .flatMap((reg) => {
          if (!reg.expiryDate) return [];
          const policy = renewalPolicy(reg.expiryDate, today);
          return policy.visible ? [{ ...reg, ...policy }] : [];
        })
        .sort((a, b) => a.daysToRenewal - b.daysToRenewal),
      manpower: factories.map((reg) => {
        const row = byBranch.get(`${reg.clientId}:${reg.branchId}`);
        return {
          ...reg,
          date: today,
          ...manpowerPolicy(
            reg.licensedWorkerLimit === null
              ? null
              : Number(reg.licensedWorkerLimit),
            Number(row?.onRoll ?? 0),
            Number(row?.contractor ?? 0),
          ),
        };
      }),
    };
  }

  @Cron('0 */5 * * * *', { timeZone: 'Asia/Kolkata', waitForCompletion: true })
  async checkScheduled() {
    try {
      const snapshot = await this.snapshot();
      for (const row of snapshot.renewals) {
        const status =
          row.status === 'EXPIRED'
            ? 'Licence expired'
            : row.status === 'OVERDUE'
              ? 'Renewal overdue'
              : row.status === 'DUE_TODAY'
                ? 'Renewal due today'
                : 'Renewal reminder';
        const message = `${row.type}${row.registrationNumber ? ' (' + row.registrationNumber + ')' : ''} at ${row.branchName}: renew by ${row.renewalDueDate}; expiry ${row.expiryDate}. ${row.daysToRenewal < 0 ? `Renewal is ${Math.abs(row.daysToRenewal)} days overdue.` : `Renewal is due in ${row.daysToRenewal} days.`}`;
        await this.notify(
          row,
          `RENEWAL:${row.registrationId}:${row.expiryDate}:${row.reminderPeriod}`,
          'RENEWAL_REMINDER',
          row.priority,
          status,
          message,
        );
      }
      for (const row of snapshot.manpower.filter(
        (reg) => reg.status === 'BREACHED',
      )) {
        const message = `${row.branchName}: ${row.total} workers punched on ${snapshot.date} (${row.onRoll} on-roll + ${row.contractor} contractor), exceeding the licensed limit of ${row.licensedWorkerLimit} by ${row.excess}. Review deployment and the factory licence limit.`;
        await this.notify(
          row,
          `MANPOWER:${row.registrationId}:${row.licensedWorkerLimit}:${snapshot.date}`,
          'MANPOWER_LIMIT',
          'HIGH',
          'Licensed manpower limit exceeded',
          message,
        );
      }
    } catch (error) {
      this.logger.error('Licence alert scan failed', error);
    }
  }

  private async notify(
    row: LicenceRow,
    key: string,
    type: string,
    priority: string,
    title: string,
    message: string,
  ) {
    // The unique event key creates one in-app alert; a lease prevents duplicate mail across pods.
    const alerts: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO registration_alerts(registration_id,client_id,branch_id,alert_type,priority,title,message,module,event_key)
       SELECT $1,$2,$3,$4,$5,$6,$7,'REGISTRATION',$8
       FROM branch_registrations r WHERE r.id=$1 AND r.client_id=$2 AND r.branch_id=$3
         AND COALESCE(r.status,'ACTIVE') <> 'DELETED' AND r.type=$9
         AND r.expiry_date IS NOT DISTINCT FROM $10::date
         AND r.licensed_worker_limit IS NOT DISTINCT FROM $11::int
       ON CONFLICT(event_key) WHERE event_key IS NOT NULL
       DO UPDATE SET priority=EXCLUDED.priority, message=EXCLUDED.message
       RETURNING id`,
      [
        row.registrationId,
        row.clientId,
        row.branchId,
        type,
        priority,
        title,
        message,
        key,
        row.type,
        row.expiryDate,
        row.licensedWorkerLimit,
      ],
    );
    if (!alerts.length) return;
    const recipients: Array<{ email: string }> = await this.dataSource.query(
      LICENCE_RECIPIENTS_SQL,
      [row.clientId, row.branchId],
    );
    if (!recipients.length) return;
    const claimed: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE registration_alerts SET email_lease_until=NOW()+INTERVAL '10 minutes'
       WHERE id=$1 AND emailed=false AND (email_lease_until IS NULL OR email_lease_until < NOW()) RETURNING id`,
      [alerts[0].id],
    );
    if (!claimed.length) return;
    try {
      const result = await this.email.sendAuditMail(
        recipients.map((recipient) => recipient.email),
        `${title} — ${row.branchName}`,
        title,
        `<p>${this.escapeHtml(message)}</p><p>Client: ${this.escapeHtml(row.clientName)}<br>Branch: ${this.escapeHtml(row.branchName)}</p><p>Review the licence and deployment warnings in LegitX or BranchDesk.</p>`,
      );
      if ('ok' in result && result.ok) {
        await this.dataSource.query(
          'UPDATE registration_alerts SET emailed=true,email_lease_until=NULL WHERE id=$1',
          [alerts[0].id],
        );
      } else {
        await this.dataSource.query(
          'UPDATE registration_alerts SET email_lease_until=NULL WHERE id=$1',
          [alerts[0].id],
        );
      }
    } catch (error) {
      await this.dataSource.query(
        'UPDATE registration_alerts SET email_lease_until=NULL WHERE id=$1',
        [alerts[0].id],
      );
      this.logger.error(
        'Licence alert email failed; retained for retry',
        error,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
