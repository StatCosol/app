import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';

/**
 * Daily cron job that checks branch registration expiries and:
 *  1. Inserts in-app alerts into registration_alerts table
 *  2. Sends email notifications via EmailService
 *
 * Runs at 2:00 AM every day.
 * Alerts are sent at 60 / 30 / 7 / 0 days before expiry and daily after expiry.
 */
@Injectable()
export class BranchRegistrationReminderService {
  private readonly logger = new Logger(BranchRegistrationReminderService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  @Cron('0 0 2 * * *') // every day at 2:00 AM
  async checkExpiries() {
    this.logger.log('Running registration expiry check...');

    try {
      // Find all non-deleted registrations that have an expiry date
      // and compute daysRemaining
      const rows: Array<{
        id: string;
        clientId: string;
        branchId: string;
        type: string;
        registrationNumber: string | null;
        expiryDate: string;
        daysRemaining: number;
        branchName: string;
        clientName: string;
        clientAdminEmail: string | null;
        clientEmail?: string | null;
        crmEmail?: string | null;
      }> = await this.dataSource.query(`
        SELECT
          r.id,
          r.client_id      AS "clientId",
          r.branch_id      AS "branchId",
          r.type,
          r.registration_number AS "registrationNumber",
          r.expiry_date     AS "expiryDate",
          (r.expiry_date - CURRENT_DATE) AS "daysRemaining",
          b.branchname     AS "branchName",
          c.client_name    AS "clientName",
          -- Get client admin (master user) email.
          -- Older schemas do not have users.is_master_user, so infer
          -- master users as CLIENT-role users with no branch mappings.
          (
            SELECT u.email FROM users u
            JOIN roles rl ON rl.id = u.role_id
            LEFT JOIN user_branches ub ON ub.user_id = u.id
            WHERE u.client_id = r.client_id
              AND rl.code = 'CLIENT'
              AND u.is_active = true
              AND u.deleted_at IS NULL
            GROUP BY u.id, u.email
            HAVING COUNT(ub.branch_id) = 0
            ORDER BY MIN(u.created_at) ASC
            LIMIT 1
          ) AS "clientEmail",
          -- Get CRM user email for this client
          (
            SELECT u.email FROM client_assignments ca
            JOIN users u ON u.id = ca.crm_user_id
            WHERE ca.client_id = r.client_id
              AND ca.end_date IS NULL
              AND u.is_active = true
            LIMIT 1
          ) AS "crmEmail"
        FROM branch_registrations r
        JOIN client_branches b ON b.id = r.branch_id
        JOIN clients c ON c.id = r.client_id
        WHERE r.expiry_date IS NOT NULL
          AND COALESCE(r.status, 'ACTIVE') <> 'DELETED'
          AND (r.expiry_date - CURRENT_DATE) <= 60
        ORDER BY (r.expiry_date - CURRENT_DATE) ASC
      `);

      this.logger.log(
        `Found ${rows.length} registrations within 60 days of expiry.`,
      );

      let alertsCreated = 0;
      let emailsSent = 0;

      for (const r of rows) {
        const days = Number(r.daysRemaining);
        const alertType = this.getAlertType(days);
        if (!alertType) continue;

        const priority = this.getPriority(days);

        // Check if we already sent this exact alert today
        const existing = await this.dataSource.query(
          `
          SELECT 1 FROM registration_alerts
          WHERE registration_id = $1
            AND alert_type = $2
            AND created_at::date = CURRENT_DATE
          LIMIT 1
        `,
          [r.id, alertType],
        );

        if (existing.length > 0) continue; // already alerted today

        const title = `Registration Expiry Alert`;
        const message =
          days < 0
            ? `${r.type}${r.registrationNumber ? ' (' + r.registrationNumber + ')' : ''} at ${r.branchName} expired ${Math.abs(days)} days ago`
            : days === 0
              ? `${r.type}${r.registrationNumber ? ' (' + r.registrationNumber + ')' : ''} at ${r.branchName} expires TODAY`
              : `${r.type}${r.registrationNumber ? ' (' + r.registrationNumber + ')' : ''} at ${r.branchName} expires in ${days} days`;

        // Insert alert
        await this.dataSource.query(
          `
          INSERT INTO registration_alerts
            (registration_id, client_id, branch_id, alert_type, priority, title, message, module)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'REGISTRATION')
        `,
          [r.id, r.clientId, r.branchId, alertType, priority, title, message],
        );

        alertsCreated++;

        // Email notification
        const recipients: string[] = [];
        if (r.clientEmail) recipients.push(r.clientEmail);
        if (r.crmEmail) recipients.push(r.crmEmail);

        // Also email admin recipients
        const adminEmails = this.emailService.adminRecipients();
        recipients.push(...adminEmails);

        if (recipients.length > 0) {
          const subject =
            days < 0
              ? `⚠ EXPIRED: ${r.type} at ${r.branchName} (${r.clientName})`
              : `⚠ ${r.type} expires in ${days} days — ${r.branchName} (${r.clientName})`;

          const body = `
            <p style="margin:0 0 12px;">
              <strong>${r.type}</strong>
              ${r.registrationNumber ? `(${r.registrationNumber})` : ''}
            </p>
            <table style="border-collapse:collapse; font-size:14px; margin-bottom:16px;">
              <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Client</td><td><strong>${r.clientName}</strong></td></tr>
              <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Branch</td><td>${r.branchName}</td></tr>
              <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Expiry Date</td><td>${new Date(r.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
              <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Status</td><td style="color:${days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#2563eb'}; font-weight:700;">
                ${days < 0 ? 'EXPIRED' : days === 0 ? 'EXPIRES TODAY' : `${days} days remaining`}
              </td></tr>
            </table>
            <p style="font-size:13px; color:#64748b;">
              Please ensure timely renewal to maintain compliance.
            </p>
          `;

          await this.emailService.send(
            [...new Set(recipients)],
            subject,
            'Registration Expiry Alert',
            body,
          );

          // Mark alert as emailed
          await this.dataSource.query(
            `
            UPDATE registration_alerts
            SET emailed = true
            WHERE registration_id = $1
              AND alert_type = $2
              AND created_at::date = CURRENT_DATE
          `,
            [r.id, alertType],
          );

          emailsSent++;
        }
      }

      this.logger.log(
        `Registration expiry check complete. Alerts: ${alertsCreated}, Emails: ${emailsSent}`,
      );
    } catch (err) {
      this.logger.error('Registration expiry check failed', err);
    }
  }

  /**
   * Determine alert type based on days remaining.
   * Returns null if no alert should be created for this day count.
   */
  private getAlertType(days: number): string | null {
    if (days < 0) return 'EXPIRED'; // daily for expired
    if (days === 0) return 'EXPIRED'; // expiry day
    if (days === 7) return '7_DAY';
    if (days === 30) return '30_DAY';
    if (days === 60) return '60_DAY';
    return null;
  }

  private getPriority(days: number): string {
    if (days < 0) return 'CRITICAL';
    if (days <= 7) return 'HIGH';
    if (days <= 30) return 'MEDIUM';
    return 'LOW';
  }
}
