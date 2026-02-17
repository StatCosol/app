import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  AuditAction,
  AuditEntityType,
} from '../audit-logs/entities/audit-log.entity';

type AuditLogsQuery = {
  entityType?: AuditEntityType;
  action?: AuditAction;
  performedBy?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
};

@Controller({ path: 'admin/audit-logs', version: '1' })
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  list(@Query() query: AuditLogsQuery) {
    const limit = query.limit ? Number(query.limit) : undefined;
    const offset = query.offset ? Number(query.offset) : undefined;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    return this.auditLogs.list({
      entityType: query.entityType,
      action: query.action,
      performedBy: query.performedBy,
      entityId: query.entityId,
      limit,
      offset,
      from,
      to,
    });
  }
}
