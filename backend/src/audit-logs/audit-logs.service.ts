import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditAction,
  AuditEntityType,
  AuditLogEntity,
} from './entities/audit-log.entity';
import { TaskApprovalHistoryEntity } from './entities/task-approval-history.entity';

export type AuditLogInput = {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy?: string | null;
  performedRole?: string | null;
  performedName?: string | null;
  reason?: string | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
};

export type ApprovalHistoryInput = {
  taskType: 'RETURN' | 'RENEWAL';
  taskId: string;
  stage: string;
  decision: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  remarks?: string | null;
};

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
    @InjectRepository(TaskApprovalHistoryEntity)
    private readonly approvalRepo: Repository<TaskApprovalHistoryEntity>,
  ) {}

  async log(input: AuditLogInput) {
    const entity = this.repo.create({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      performedBy: input.performedBy ?? null,
      snapshot: {
        performedRole: input.performedRole ?? null,
        performedName: input.performedName ?? null,
        reason: input.reason ?? null,
        before: input.beforeJson ?? null,
        after: input.afterJson ?? null,
        meta: input.meta ?? null,
      },
    });
    return this.repo.save(entity);
  }

  async logApproval(input: ApprovalHistoryInput) {
    const entity = this.approvalRepo.create({
      taskType: input.taskType,
      taskId: input.taskId,
      stage: input.stage,
      decision: input.decision,
      actorUserId: input.actorUserId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
      remarks: input.remarks ?? null,
    });
    return this.approvalRepo.save(entity);
  }

  /** Retrieve full audit timeline for an entity */
  async findTimeline(entityType: AuditEntityType, entityId: string) {
    return this.repo.find({
      where: { entityType, entityId },
      order: { createdAt: 'ASC' },
    });
  }

  /** Retrieve approval history for a task */
  async findApprovalHistory(taskType: 'RETURN' | 'RENEWAL', taskId: string) {
    return this.approvalRepo.find({
      where: { taskType, taskId },
      order: { createdAt: 'ASC' },
    });
  }

  /** Combined timeline: audit logs + approval history merged chronologically */
  async findCombinedTimeline(
    entityType: AuditEntityType,
    entityId: string,
    taskType: 'RETURN' | 'RENEWAL',
  ) {
    const [logs, approvals] = await Promise.all([
      this.findTimeline(entityType, entityId),
      this.findApprovalHistory(taskType, entityId),
    ]);

    return [
      ...logs.map((x) => ({
        type: 'AUDIT' as const,
        action: x.action,
        actorName: (x.snapshot?.performedName as string) ?? null,
        actorRole: (x.snapshot?.performedRole as string) ?? null,
        remarks: (x.snapshot?.reason as string) ?? null,
        createdAt: x.createdAt,
        meta: (x.snapshot?.meta as Record<string, unknown>) ?? null,
      })),
      ...approvals.map((x) => ({
        type: 'APPROVAL' as const,
        action: x.decision,
        stage: x.stage,
        actorName: x.actorName,
        actorRole: x.actorRole,
        remarks: x.remarks,
        createdAt: x.createdAt,
        meta: null,
      })),
    ].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  async list(params?: {
    entityType?: AuditEntityType;
    action?: AuditAction;
    performedBy?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
    from?: Date;
    to?: Date;
  }) {
    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .take(Math.min(params?.limit ?? 50, 200))
      .skip(params?.offset ?? 0);

    if (params?.entityType)
      qb.andWhere('log.entityType = :entityType', {
        entityType: params.entityType,
      });
    if (params?.action)
      qb.andWhere('log.action = :action', { action: params.action });
    if (params?.performedBy)
      qb.andWhere('log.performedBy = :performedBy', {
        performedBy: params.performedBy,
      });
    if (params?.entityId)
      qb.andWhere('log.entityId = :entityId', { entityId: params.entityId });
    if (params?.from)
      qb.andWhere('log.createdAt >= :from', { from: params.from });
    if (params?.to) qb.andWhere('log.createdAt <= :to', { to: params.to });

    return qb.getMany();
  }
}
