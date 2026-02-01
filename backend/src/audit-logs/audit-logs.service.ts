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
}
