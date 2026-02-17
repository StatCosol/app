import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditAction,
  AuditEntityType,
  AuditLogEntity,
} from './entities/audit-log.entity';

export type AuditLogInput = {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy?: string | null;
  performedRole?: string | null;
  reason?: string | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
};

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async log(input: AuditLogInput) {
    const entity = this.repo.create({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      performedBy: input.performedBy ?? null,
      snapshot: {
        performedRole: input.performedRole ?? null,
        reason: input.reason ?? null,
        before: input.beforeJson ?? null,
        after: input.afterJson ?? null,
      },
    });
    return this.repo.save(entity);
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
