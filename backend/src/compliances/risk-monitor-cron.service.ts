import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMetricsService } from './compliance-metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EscalationsService } from '../escalations/escalations.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class RiskMonitorCronService {
  private readonly logger = new Logger(RiskMonitorCronService.name);

  /** Probability thresholds (adjustable later via config/DB) */
  private readonly HIGH_THRESHOLD = 70;
  private readonly CRITICAL_THRESHOLD = 85;

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly metrics: ComplianceMetricsService,
    private readonly notifications: NotificationsService,
    private readonly escalations: EscalationsService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Daily risk monitor — runs at 03:10 AM.
   *
   * For every branch:
   *  - If inspectionProbability >= 70 → HIGH notification (once per month)
   *  - If inspectionProbability >= 85 → CRITICAL notification (once per month)
   *  - If CRITICAL for 2 consecutive months → auto-escalation + notification
   */
  @Cron('0 10 3 * * *')
  async runDaily() {
    this.logger.log('Risk monitor cron started');

    const month = this.currentMonth();
    const prevMonth = this.shiftMonth(month, -1);

    try {
      const branches = await this.branchRepo.find({
        where: { isActive: true, isDeleted: false },
        select: ['id', 'clientId', 'branchName'],
      });

      // Group by client
      const byClient = new Map<string, typeof branches>();
      for (const b of branches) {
        if (!b.clientId) continue;
        if (!byClient.has(b.clientId)) byClient.set(b.clientId, []);
        byClient.get(b.clientId)!.push(b);
      }

      let processed = 0;
      let alerts = 0;

      for (const [clientId, clientBranches] of byClient.entries()) {
        for (const b of clientBranches) {
          const result = await this.processBranch(
            clientId,
            b.id,
            b.branchName || 'Branch',
            month,
            prevMonth,
          );
          processed++;
          alerts += result;
        }
      }

      this.logger.log(
        `Risk monitor complete: ${processed} branches, ${alerts} alerts generated`,
      );
    } catch (err: any) {
      this.logger.error('Risk monitor cron failed', err?.stack);
    }
  }

  /**
   * Process a single branch — returns count of alerts created.
   */
  private async processBranch(
    clientId: string,
    branchId: string,
    branchName: string,
    month: string,
    prevMonth: string,
  ): Promise<number> {
    let alertCount = 0;

    try {
      // Current month risk
      const cur = await this.metrics.getRiskScore({
        clientId,
        user: { branchIds: [] } as unknown as ReqUser,
        month,
        branchId,
      });
      const curRow = (cur.items || [])[0];
      if (!curRow) return 0;

      const prob = curRow.inspectionProbability ?? 0;
      const score = curRow.riskScore ?? 0;

      // 1) HIGH notification  (prob >= 70)
      if (prob >= this.HIGH_THRESHOLD) {
        const sourceKey = `RISK:HIGH:${branchId}:${month}`;
        await this.notifications.createSystemNotification({
          clientId,
          sourceKey,
          subject: `⚠️ High inspection risk: ${branchName} (${prob}%)`,
          message: this.buildMessage(curRow, 'HIGH', month),
          branchId,
          priority: 1,
        });
        alertCount++;

        // Email alert for HIGH risk
        await this.sendRiskEmail(branchName, curRow, 'HIGH', month);
      }

      // 2) CRITICAL notification (prob >= 85)
      if (prob >= this.CRITICAL_THRESHOLD) {
        const sourceKey = `RISK:CRITICAL:${branchId}:${month}`;
        await this.notifications.createSystemNotification({
          clientId,
          sourceKey,
          subject: `🚨 CRITICAL inspection risk: ${branchName} (${prob}%)`,
          message: this.buildMessage(curRow, 'CRITICAL', month),
          branchId,
          priority: 1,
        });
        alertCount++;

        // Email alert for CRITICAL risk
        await this.sendRiskEmail(branchName, curRow, 'CRITICAL', month);
      }

      // 3) Auto remediation tasks for HIGH+ risk branches
      if (prob >= this.HIGH_THRESHOLD) {
        await this.generateRemediationTasks(
          clientId,
          branchId,
          branchName,
          month,
          curRow,
        );
      }

      // 3) Escalation if CRITICAL for 2 consecutive months
      if (prob >= this.CRITICAL_THRESHOLD) {
        const prev = await this.metrics.getRiskScore({
          clientId,
          user: { branchIds: [] } as unknown as ReqUser,
          month: prevMonth,
          branchId,
        });
        const prevRow = (prev.items || [])[0];
        const prevProb = prevRow?.inspectionProbability ?? 0;

        if (prevProb >= this.CRITICAL_THRESHOLD) {
          const escKey = `ESC:RISK:2MONTH_CRITICAL:${branchId}:${month}`;
          const reason =
            `Branch has remained CRITICAL for 2 consecutive months.\n` +
            `Current month (${month}) probability: ${prob}%\n` +
            `Previous month (${prevMonth}) probability: ${prevProb}%\n` +
            `Reasons: ${(curRow.reasons || []).join('; ')}`;

          await this.escalations.createSystemEscalation({
            clientId,
            sourceKey: escKey,
            branchId,
            reason,
            riskScore: score,
            slaOverdueCount: curRow.overdueSla ?? 0,
          });

          // Also notify about escalation
          await this.notifications.createSystemNotification({
            clientId,
            sourceKey: `NOTIF:${escKey}`,
            subject: `🔴 Escalation: ${branchName} critical risk for 2 months`,
            message: reason,
            branchId,
            priority: 1,
          });

          // Escalation email
          await this.sendEscalationEmail(
            branchName,
            month,
            prevMonth,
            prob,
            prevProb,
            curRow,
          );

          alertCount++;
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Risk monitor: error processing branch ${branchId}: ${err?.message}`,
      );
    }

    return alertCount;
  }

  private buildMessage(
    row: {
      inspectionProbability: number;
      completionPercent: number;
      overdueSla: number;
      highCritical: number;
      expiringRegistrations: boolean;
      reasons?: string[];
    },
    level: string,
    month: string,
  ): string {
    const parts: string[] = [];
    parts.push(`Month: ${month}`);
    parts.push(
      `Inspection Probability: ${row.inspectionProbability}% (${level})`,
    );
    parts.push(`Upload Completion: ${row.completionPercent}%`);
    parts.push(`Overdue SLA: ${row.overdueSla}`);
    parts.push(`High/Critical Items: ${row.highCritical}`);
    parts.push(
      `Registration expiring: ${row.expiringRegistrations ? 'Yes' : 'No'}`,
    );
    if (row.reasons?.length) {
      parts.push(`Reasons: ${row.reasons.join('; ')}`);
    }
    return parts.join('\n');
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private shiftMonth(yyyyMm: string, delta: number): string {
    const [y, m] = yyyyMm.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // ─── Email Alerts ─────────────────────────────────────────────

  /**
   * Send a risk alert email to admin recipients.
   */
  private async sendRiskEmail(
    branchName: string,
    row: {
      inspectionProbability: number;
      completionPercent: number;
      overdueSla: number;
      highCritical: number;
      expiringRegistrations: boolean;
      branchId?: string;
      reasons?: string[];
    },
    level: 'HIGH' | 'CRITICAL',
    month: string,
  ) {
    try {
      const recipients = this.emailService.adminRecipients();
      if (!recipients.length) return;

      const color = level === 'CRITICAL' ? '#dc2626' : '#f97316';
      const subject =
        level === 'CRITICAL'
          ? `🚨 CRITICAL Risk Alert: ${branchName} (${row.inspectionProbability}%)`
          : `⚠️ High Risk Alert: ${branchName} (${row.inspectionProbability}%)`;

      // Get action plan for top 3 recommendations
      let actionHtml = '';
      try {
        const plan = await this.metrics.getActionPlan({
          clientId: '',
          user: { branchIds: [] } as unknown as ReqUser,
          month,
          branchId: row.branchId || '',
        });
        const top3 = (plan.actions || []).slice(0, 3);
        if (top3.length) {
          actionHtml = `
            <p style="font-size:13px;font-weight:600;color:#374151;margin-top:16px;">Top Recommended Actions:</p>
            <ol style="font-size:13px;color:#374151;margin:8px 0;padding-left:20px;">
              ${top3.map((a: { priority: string; text: string }) => `<li style="margin-bottom:6px;"><span style="color:${a.priority === 'CRITICAL' ? '#dc2626' : a.priority === 'HIGH' ? '#f97316' : '#6b7280'};font-weight:600;">[${a.priority}]</span> ${a.text}</li>`).join('')}
            </ol>
          `;
        }
      } catch {
        /* ignore action plan errors in email */
      }

      // Build summary narrative
      const summaryText = [
        `Inspection probability: ${row.inspectionProbability}% (${level}).`,
        `Upload completion: ${row.completionPercent}%.`,
        `Overdue SLA tasks: ${row.overdueSla}.`,
        row.expiringRegistrations
          ? 'Registration expiring within 30 days.'
          : '',
      ]
        .filter(Boolean)
        .join(' ');

      const frontendUrl = this.config.get<string>(
        'FRONTEND_URL',
        'http://localhost:4200',
      );
      const deepLink = `${frontendUrl}/crm/branches/${row.branchId || ''}/compliance?month=${month}`;

      const bodyHtml = `
        <p style="font-size:14px;color:#374151;">
          Branch <strong>${branchName}</strong> has been flagged as
          <span style="color:${color};font-weight:bold;">${level}</span>
          risk for <strong>${month}</strong>.
        </p>
        <p style="font-size:13px;color:#4b5563;margin:12px 0;padding:10px;background:#f9fafb;border-radius:8px;">
          ${summaryText}
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">Inspection Probability</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:${color};font-weight:bold;">${row.inspectionProbability}%</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">Upload Completion</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${row.completionPercent}%</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">Overdue SLA Tasks</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${row.overdueSla}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">High/Critical Items</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${row.highCritical}</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">Registration Expiring</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${row.expiringRegistrations ? 'Yes' : 'No'}</td></tr>
        </table>
        ${actionHtml}
        <p style="font-size:13px;color:#6b7280;">
          <strong>Reasons:</strong> ${(row.reasons || []).join('; ') || 'N/A'}
        </p>
        <p style="margin-top:16px;">
          <a href="${deepLink}" style="display:inline-block;padding:10px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
            View Branch Compliance →
          </a>
        </p>
      `;

      await this.emailService.send(
        recipients,
        subject,
        `${level} Risk Alert`,
        bodyHtml,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to send ${level} risk email for ${branchName}: ${err?.message}`,
      );
    }
  }

  /**
   * Send an escalation email when a branch is CRITICAL for 2+ consecutive months.
   */
  private async sendEscalationEmail(
    branchName: string,
    month: string,
    prevMonth: string,
    prob: number,
    prevProb: number,
    row: { reasons?: string[] },
  ) {
    try {
      const recipients = this.emailService.adminRecipients();
      if (!recipients.length) return;

      const subject = `🔴 ESCALATION: ${branchName} critical for 2 consecutive months`;

      const bodyHtml = `
        <p style="font-size:14px;color:#374151;">
          Branch <strong>${branchName}</strong> has remained at
          <span style="color:#dc2626;font-weight:bold;">CRITICAL</span> risk
          for <strong>two consecutive months</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">${month} Probability</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold;">${prob}%</td></tr>
          <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">${prevMonth} Probability</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold;">${prevProb}%</td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;">
          <strong>Current Reasons:</strong> ${(row.reasons || []).join('; ') || 'N/A'}
        </p>
        <p style="font-size:14px;color:#991b1b;font-weight:bold;">
          Immediate action is required. A formal escalation has been created in the system.
        </p>
      `;

      await this.emailService.send(
        recipients,
        subject,
        'Escalation Alert',
        bodyHtml,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to send escalation email for ${branchName}: ${err?.message}`,
      );
    }
  }

  // ─── Auto Remediation Task Generator ──────────────────────────

  /**
   * Generate specific remediation tasks (as escalation records) based on
   * which risk factors are contributing to the high score.
   * Each task uses source_key for dedup — won't create duplicates.
   */
  private async generateRemediationTasks(
    clientId: string,
    branchId: string,
    branchName: string,
    month: string,
    row: {
      completionPercent?: number;
      overdueSla?: number;
      highCritical?: number;
      expiringRegistrations?: boolean;
      reasons?: string[];
      riskScore?: number;
    },
  ) {
    const tasks: { key: string; reason: string }[] = [];

    // Task 1: Upload pending documents (if completion < 60%)
    if ((row.completionPercent ?? 100) < 60) {
      tasks.push({
        key: `REMED:UPLOAD:${branchId}:${month}`,
        reason:
          `[Remediation] Upload pending compliance documents for ${branchName}.\n` +
          `Current upload completion: ${row.completionPercent}% (target: ≥80%).\n` +
          `Month: ${month}. Priority: Upload all mandatory returns and MCD documents.`,
      });
    }

    // Task 2: Close overdue SLA tasks (if overdueSla > 0)
    if ((row.overdueSla ?? 0) > 0) {
      tasks.push({
        key: `REMED:SLA:${branchId}:${month}`,
        reason:
          `[Remediation] Resolve ${row.overdueSla} overdue SLA task(s) for ${branchName}.\n` +
          `Overdue tasks increase inspection probability by up to 30%.\n` +
          `Month: ${month}. Priority: Close or extend all past-due SLA items.`,
      });
    }

    // Task 3: Address high/critical compliance items
    if ((row.highCritical ?? 0) > 0) {
      tasks.push({
        key: `REMED:HIGHCRIT:${branchId}:${month}`,
        reason:
          `[Remediation] Address ${row.highCritical} high/critical compliance item(s) for ${branchName}.\n` +
          `These items carry elevated regulatory weight.\n` +
          `Month: ${month}. Priority: Verify filing status and upload proof of compliance.`,
      });
    }

    // Task 4: Renew expiring registrations
    if (row.expiringRegistrations) {
      tasks.push({
        key: `REMED:REG:${branchId}:${month}`,
        reason:
          `[Remediation] Renew expiring registration(s) for ${branchName}.\n` +
          `One or more registrations/licenses expire within 30 days.\n` +
          `Month: ${month}. Priority: Initiate renewal process immediately.`,
      });
    }

    for (const t of tasks) {
      try {
        await this.escalations.createSystemEscalation({
          clientId,
          sourceKey: t.key,
          branchId,
          reason: t.reason,
          riskScore: row.riskScore ?? 0,
          slaOverdueCount: row.overdueSla ?? 0,
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to create remediation task ${t.key}: ${err?.message}`,
        );
      }
    }

    if (tasks.length) {
      this.logger.log(
        `Generated ${tasks.length} remediation task(s) for ${branchName} (${month})`,
      );
    }
  }
}
