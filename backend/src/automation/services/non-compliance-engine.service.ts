import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  AuditNonComplianceEntity,
  NcStatus,
} from '../../audits/entities/audit-non-compliance.entity';
import { AuditEntity } from '../../audits/entities/audit.entity';
import { TaskEngineService } from './task-engine.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class NonComplianceEngineService {
  private readonly logger = new Logger(NonComplianceEngineService.name);

  constructor(
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    private readonly taskEngine: TaskEngineService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a system task when an NC is raised.
   * Call this AFTER the NC record has already been created by AuditsService.
   */
  async createTaskForNc(ncId: string): Promise<void> {
    const nc = await this.ncRepo.findOne({ where: { id: ncId } });
    if (!nc) return;

    const audit = await this.auditRepo.findOne({ where: { id: nc.auditId } });
    if (!audit) return;

    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

    await this.taskEngine.createAuditNcTask({
      auditId: nc.auditId,
      ncId: nc.id,
      assignedRole:
        nc.requestedToRole === 'CONTRACTOR'
          ? ('CONTRACTOR' as const)
          : ('BRANCH' as const),
      assignedUserId: nc.requestedToUserId,
      clientId: audit.clientId,
      branchId: audit.branchId || null,
      contractorId:
        nc.requestedToRole === 'CONTRACTOR' ? nc.requestedToUserId : null,
      dueDate,
      description:
        nc.remark || `Non-complied document: ${nc.documentName || 'Unknown'}`,
    });
  }

  /** Mark an NC as reuploaded (contractor/branch uploaded corrected doc). */
  async markReuploaded(ncId: string): Promise<AuditNonComplianceEntity> {
    const nc = await this.ncRepo.findOne({ where: { id: ncId } });
    if (!nc) throw new NotFoundException('Non-compliance not found');
    nc.status = 'REUPLOADED' as NcStatus;
    return this.ncRepo.save(nc);
  }

  /** Mark as reverification pending (auditor is reviewing). */
  async markReverificationPending(
    ncId: string,
  ): Promise<AuditNonComplianceEntity> {
    const nc = await this.ncRepo.findOne({ where: { id: ncId } });
    if (!nc) throw new NotFoundException('Non-compliance not found');
    nc.status = 'REVERIFICATION_PENDING' as NcStatus;
    return this.ncRepo.save(nc);
  }

  /** Close an NC + its system task. Also try closing the parent schedule. */
  async closeNc(ncId: string): Promise<AuditNonComplianceEntity> {
    const nc = await this.ncRepo.findOne({ where: { id: ncId } });
    if (!nc) throw new NotFoundException('Non-compliance not found');
    nc.status = 'CLOSED' as NcStatus;
    nc.closedAt = new Date();
    const saved = await this.ncRepo.save(nc);

    // Close associated system task
    await this.taskEngine.closeTasksByReference('AUDIT_NON_COMPLIANCE', ncId);

    // Try to close the audit schedule if all NCs are resolved
    await this.tryCloseAuditSchedule(nc.auditId);

    return saved;
  }

  /**
   * After an NC is closed, check if ALL NCs for this audit are closed.
   * If so, mark the audit_schedules row as COMPLETED.
   */
  private async tryCloseAuditSchedule(auditId: string): Promise<void> {
    try {
      // Check for any open NCs remaining
      const openCount = await this.ncRepo.count({
        where: [
          { auditId, closedAt: IsNull(), status: 'NC_RAISED' as NcStatus },
          {
            auditId,
            closedAt: IsNull(),
            status: 'AWAITING_REUPLOAD' as NcStatus,
          },
          { auditId, closedAt: IsNull(), status: 'REUPLOADED' as NcStatus },
          {
            auditId,
            closedAt: IsNull(),
            status: 'REVERIFICATION_PENDING' as NcStatus,
          },
        ],
      });

      if (openCount > 0) return;

      // All NCs closed — find + close linked schedule
      const schedRows = await this.dataSource.query(
        `SELECT id FROM audit_schedules
         WHERE id = (SELECT schedule_id FROM audits WHERE id = $1 AND schedule_id IS NOT NULL)
           AND status NOT IN ('COMPLETED', 'CANCELLED')
         LIMIT 1`,
        [auditId],
      );
      if (!schedRows.length) return;

      await this.dataSource.query(
        `UPDATE audit_schedules SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [schedRows[0].id],
      );

      this.logger.log(
        `Auto-closed audit schedule ${schedRows[0].id} — all NCs resolved for audit ${auditId}`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `tryCloseAuditSchedule failed for audit ${auditId}: ${errMsg}`,
      );
    }
  }

  /** Get all open NCs (for daily reminders). */
  async getOpenNcForDailyReminder(): Promise<AuditNonComplianceEntity[]> {
    return this.ncRepo.find({
      where: [
        { closedAt: IsNull(), status: 'NC_RAISED' as NcStatus },
        { closedAt: IsNull(), status: 'AWAITING_REUPLOAD' as NcStatus },
        { closedAt: IsNull(), status: 'REUPLOADED' as NcStatus },
        { closedAt: IsNull(), status: 'REVERIFICATION_PENDING' as NcStatus },
      ],
      order: { raisedAt: 'ASC' },
    });
  }

  /**
   * Send daily NC reminders to responsible parties.
   * Called by the NonComplianceRemindersJob cron.
   */
  async sendDailyReminders(): Promise<{
    totalOpenNc: number;
    remindersSent: number;
  }> {
    const rows = await this.getOpenNcForDailyReminder();
    let sent = 0;

    for (const nc of rows) {
      try {
        const audit = await this.auditRepo.findOne({
          where: { id: nc.auditId },
        });
        if (!audit) continue;

        const auditCode = audit.auditCode || audit.id.slice(0, 8);
        const subject = `Pending audit NC — ${auditCode}`;
        const message =
          `Please upload corrected document for this audit non-compliance.\n\n` +
          `Audit: ${auditCode}\n` +
          `Document: ${nc.documentName || 'N/A'}\n` +
          `Remark: ${nc.remark || 'N/A'}\n` +
          `Status: ${nc.status}\n` +
          `Raised: ${nc.raisedAt ? new Date(nc.raisedAt).toDateString() : 'N/A'}`;

        // Use existing notification system
        await this.notificationsService.createTicket(
          audit.assignedAuditorId ?? audit.createdByUserId,
          'AUDITOR',
          {
            subject,
            message,
            queryType: 'AUDIT',
            clientId: audit.clientId,
            branchId: audit.branchId || undefined,
          },
        );
        sent++;
      } catch (err) {
        this.logger.error(
          `NC reminder failed for ${nc.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(`NC reminders: ${sent}/${rows.length} sent`);
    return { totalOpenNc: rows.length, remindersSent: sent };
  }
}
