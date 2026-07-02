import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditNonComplianceEntity } from '../entities/audit-non-compliance.entity';
import { AuditEntity } from '../entities/audit.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

/**
 * Phase 5: daily escalator that finds NCs whose vendor closure window has
 * elapsed without acceptance and notifies the auditor + CRM.
 *
 * One log entry + one ticket per NC per day (idempotent via meta probe).
 */
@Injectable()
export class AuditNcEscalationJob {
  private readonly logger = new Logger(AuditNcEscalationJob.name);

  constructor(
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  // Daily at 07:30 IST
  @Cron('0 30 7 * * *', { timeZone: 'Asia/Kolkata' })
  async handle(): Promise<void> {
    this.logger.log('Audit NC escalation scan starting');
    try {
      const result = await this.scan();
      this.logger.log(
        `NC escalation: scanned=${result.scanned} escalated=${result.escalated}`,
      );
    } catch (err) {
      this.logger.error(
        `NC escalation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async scan(): Promise<{ scanned: number; escalated: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const overdue: AuditNonComplianceEntity[] = await this.ncRepo
      .createQueryBuilder('nc')
      .where('nc.status IN (:...st)', {
        st: ['NC_RAISED', 'AWAITING_REUPLOAD'],
      })
      .andWhere('nc.vendorWindowUntil IS NOT NULL')
      .andWhere('nc.vendorWindowUntil < :today', { today })
      // Skip NCs whose audit/client has been soft-deleted
      .andWhere(
        `nc.auditId NOT IN (
           SELECT a.id FROM audits a
           JOIN clients c ON c.id = a.client_id
           WHERE COALESCE(c.is_deleted, false) = true
         )`,
      )
      .getMany();

    let escalated = 0;
    for (const nc of overdue) {
      try {
        // Skip if we already escalated today (probe last log entry)
        const recent = await this.dataSource.query(
          `SELECT id FROM audit_logs
            WHERE entity_type = 'AUDIT_NC'
              AND entity_id = $1
              AND action = 'NC_OVERDUE_ESCALATED'
              AND created_at >= NOW() - INTERVAL '20 hours'
            LIMIT 1`,
          [nc.id],
        );
        if (recent.length) continue;

        const audit = await this.auditRepo.findOne({
          where: { id: nc.auditId },
        });
        if (!audit) continue;
        const auditCode = audit.auditCode || audit.id.slice(0, 8);
        const subject = `Overdue audit NC \u2014 ${auditCode}`;
        const message =
          `Vendor closure window has elapsed without an acceptable correction.\n\n` +
          `Audit: ${auditCode}\n` +
          `Document: ${nc.documentName || 'N/A'}\n` +
          `Finding: ${nc.remark || 'N/A'}\n` +
          `Deadline was: ${nc.vendorWindowUntil}\n` +
          `Status: ${nc.status}`;

        // Notify the auditor
        if (audit.assignedAuditorId) {
          await this.notifications.createTicket(
            audit.assignedAuditorId,
            'AUDITOR',
            {
              subject,
              message,
              queryType: 'AUDIT',
              clientId: audit.clientId,
              branchId: audit.branchId || undefined,
            },
          );
        }

        await this.auditLogs.log({
          entityType: 'AUDIT_NC',
          entityId: nc.id,
          action: 'NC_OVERDUE_ESCALATED',
          performedBy: null,
          performedRole: 'SYSTEM',
          meta: {
            auditId: nc.auditId,
            deadline: nc.vendorWindowUntil,
            documentName: nc.documentName,
          },
        });
        escalated++;
      } catch (err) {
        this.logger.warn(
          `Escalation failed for NC ${nc.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { scanned: overdue.length, escalated };
  }
}
