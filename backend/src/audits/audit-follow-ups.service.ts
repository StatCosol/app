import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import {
  AuditLogInput,
  AuditLogsService,
} from '../audit-logs/audit-logs.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';

type FollowUpEvent = 'NC_ACCEPTED' | 'NC_REJECTED' | 'NC_REUPLOADED';
type JobStatus = 'PENDING' | 'RETRY' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
interface FollowUpJob {
  id: string;
  audit_id: string;
  nc_id: string;
  resubmission_id: string;
  event: FollowUpEvent;
  payload: AuditLogInput;
  status: JobStatus;
  attempts: number;
}

@Injectable()
export class AuditFollowUpsService {
  private readonly logger = new Logger(AuditFollowUpsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly output: AuditOutputEngineService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async enqueue(
    manager: EntityManager,
    input: {
      auditId: string;
      ncId: string;
      resubmissionId: string;
      event: FollowUpEvent;
      log: AuditLogInput;
    },
  ): Promise<string> {
    const [job] = await manager.query(
      `INSERT INTO audit_follow_up_jobs (audit_id, nc_id, resubmission_id, event, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (resubmission_id, event) DO UPDATE SET event = EXCLUDED.event
       RETURNING id`,
      [
        input.auditId,
        input.ncId,
        input.resubmissionId,
        input.event,
        JSON.stringify(input.log),
      ],
    );
    return job.id;
  }

  async drain(): Promise<void> {
    const jobs = await this.dataSource.query(
      `SELECT id FROM audit_follow_up_jobs
       WHERE status IN ('PENDING', 'RETRY') AND next_attempt_at <= now()
       ORDER BY next_attempt_at, id LIMIT 20`,
    );
    for (const job of jobs) await this.run(job.id);
  }

  async run(id: string): Promise<JobStatus> {
    try {
      const [candidate]: FollowUpJob[] = await this.dataSource.query(
        'SELECT * FROM audit_follow_up_jobs WHERE id = $1',
        [id],
      );
      if (!candidate) return 'SKIPPED';
      return await this.dataSource.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout = '3s'");
        await manager.query("SET LOCAL statement_timeout = '30s'");
        // Match correction lock order. The DB transaction is the claim: a restart
        // rolls back both effects and completion, leaving the job available.
        const [audit] = await manager.query(
          'SELECT id, client_id, status FROM audits WHERE id = $1 FOR UPDATE SKIP LOCKED',
          [candidate.audit_id],
        );
        if (!audit) return 'PENDING';
        const [nc] = await manager.query(
          'SELECT status FROM audit_non_compliances WHERE id = $1 AND audit_id = $2 FOR UPDATE',
          [candidate.nc_id, candidate.audit_id],
        );
        const [job]: FollowUpJob[] = await manager.query(
          `SELECT * FROM audit_follow_up_jobs WHERE id = $1
           AND status IN ('PENDING', 'RETRY') AND next_attempt_at <= now()
           FOR UPDATE SKIP LOCKED`,
          [id],
        );
        if (!job) return candidate.status;
        await manager.query('SAVEPOINT audit_follow_up_effects');
        try {
          const [client] = await manager.query(
            'SELECT is_deleted FROM clients WHERE id = $1 FOR SHARE',
            [audit.client_id],
          );
          const [latest] = await manager.query(
            `SELECT id, final_mark FROM audit_resubmissions WHERE non_compliance_id = $1
             ORDER BY resubmitted_at DESC, created_at DESC, id DESC LIMIT 1`,
            [job.nc_id],
          );
          const active =
            !!client && !client.is_deleted && audit.status !== 'CANCELLED';
          const current = latest?.id === job.resubmission_id;
          const accepted =
            current &&
            latest.final_mark === 'COMPLIED' &&
            ['ACCEPTED', 'CLOSED'].includes(nc?.status);
          const rejected =
            current &&
            !['CLOSED', 'COMPLETED'].includes(audit.status) &&
            latest.final_mark === 'NON_COMPLIED' &&
            ['NC_RAISED', 'AWAITING_REUPLOAD'].includes(nc?.status);
          const applicable =
            active &&
            (job.event === 'NC_REUPLOADED' ||
              (job.event === 'NC_ACCEPTED' ? accepted : rejected));
          if (applicable && job.event === 'NC_ACCEPTED') {
            await this.ncEngine.closeNc(job.nc_id, manager);
            await this.output.refreshAuditOutputs(job.audit_id, manager);
          } else if (applicable && job.event === 'NC_REJECTED') {
            await this.ncEngine.createTaskForNc(job.nc_id, manager);
          }
          // Historical activity remains valid even when a newer decision supersedes it.
          await this.auditLogs.log(job.payload, manager);
          const status = applicable ? 'SUCCEEDED' : 'SKIPPED';
          await manager.query(
            `UPDATE audit_follow_up_jobs SET status = $2, attempts = attempts + 1,
             last_error = NULL, completed_at = now(), updated_at = now() WHERE id = $1`,
            [id, status],
          );
          return status;
        } catch {
          await manager.query('ROLLBACK TO SAVEPOINT audit_follow_up_effects');
          const attempts = job.attempts + 1;
          const status = attempts >= 8 ? 'FAILED' : 'RETRY';
          const delay = Math.min(3600, 60 * 2 ** Math.min(attempts - 1, 6));
          await manager.query(
            `UPDATE audit_follow_up_jobs SET status = $2, attempts = $3,
             next_attempt_at = now() + $4 * interval '1 second',
             last_error = 'Follow-up could not complete. Review server health before retrying.',
             updated_at = now() WHERE id = $1`,
            [id, status, attempts, delay],
          );
          this.logger.warn({
            event: 'AUDIT_FOLLOW_UP_RETRY',
            jobId: id,
            attempts,
            status,
          });
          return status;
        }
      });
    } catch {
      // Connection/commit failures leave the durable job available for the next scan.
      this.logger.error({ event: 'AUDIT_FOLLOW_UP_UNAVAILABLE', jobId: id });
      return 'PENDING';
    }
  }

  async list(
    user: ReqUser,
    status: string | undefined,
    page: number,
    limit: number,
  ) {
    this.assertAdmin(user);
    const where = '($1::text IS NULL OR j.status = $1)';
    const [count] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM audit_follow_up_jobs j WHERE ${where}`,
      [status ?? null],
    );
    const items = await this.dataSource.query(
      `SELECT j.id, j.audit_id AS "auditId", a.audit_code AS "auditCode", j.event, j.status,
       j.attempts, j.retry_count AS "retryCount", j.last_error AS "lastError",
       j.created_at AS "createdAt", j.next_attempt_at AS "nextAttemptAt", j.completed_at AS "completedAt"
       FROM audit_follow_up_jobs j JOIN audits a ON a.id = j.audit_id
       WHERE ${where} ORDER BY j.created_at DESC, j.id DESC LIMIT $2 OFFSET $3`,
      [status ?? null, limit, (page - 1) * limit],
    );
    return { items, total: count.total, page, limit };
  }

  async retry(user: ReqUser, id: string) {
    this.assertAdmin(user);
    return this.dataSource.transaction(async (manager) => {
      const [job] = await manager.query(
        `SELECT id, nc_id, audit_id FROM audit_follow_up_jobs
         WHERE id = $1 AND status IN ('RETRY', 'FAILED') FOR UPDATE SKIP LOCKED`,
        [id],
      );
      if (!job)
        throw new ConflictException(
          'This job is not available for retry. Refresh the list.',
        );
      await manager.query(
        `UPDATE audit_follow_up_jobs SET status = 'PENDING', attempts = 0,
         retry_count = retry_count + 1, next_attempt_at = now(), last_error = NULL,
         completed_at = NULL, updated_at = now() WHERE id = $1`,
        [id],
      );
      await this.auditLogs.log(
        {
          entityType: 'AUDIT_NC',
          entityId: job.nc_id,
          action: 'UPDATE',
          performedBy: user.userId || user.id,
          performedRole: 'ADMIN',
          meta: {
            auditId: job.audit_id,
            followUpJobId: id,
            operation: 'RETRY_FOLLOW_UP',
          },
        },
        manager,
      );
      return { id, status: 'PENDING' };
    });
  }

  private assertAdmin(user: ReqUser) {
    if (user?.roleCode !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
  }
}
