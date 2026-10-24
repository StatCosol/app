import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { reviewAuditAction } from './audit-action-approval';

@Controller({ path: 'cco/audit-action-approvals', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO')
export class AuditActionApprovalController {
  constructor(
    private readonly db: DataSource,
    private readonly scope: AccessScopeService,
  ) {}
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    const ids = await this.scope.getCcoClientIds(user.userId);
    return this.db.query(
      `SELECT r.*,u.name AS "requestedByName",v.name AS "reviewedByName",a.status AS "currentAuditStatus" FROM audit_action_requests r LEFT JOIN users u ON u.id=r.requested_by LEFT JOIN users v ON v.id=r.reviewed_by LEFT JOIN audits a ON a.id=r.audit_id WHERE r.client_id=ANY($1::uuid[]) ORDER BY (r.status='PENDING_CCO') DESC,r.requested_at DESC LIMIT 500`,
      [ids],
    );
  }
  @Post(':id/review')
  review(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; note: string },
  ) {
    return reviewAuditAction(
      this.db,
      user,
      id,
      body?.decision,
      body?.note,
      (clientId) => this.scope.assertCcoClientAllowed(user, clientId),
    );
  }
}
