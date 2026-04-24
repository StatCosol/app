import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminActionsService } from './admin-actions.service';
import { AdminNotifyDto } from './dto/admin-notify.dto';
import { AdminReassignDto } from './dto/admin-reassign.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
/**
 * Admin Actions Controller
 *
 * Endpoints for admin governance actions:
 * - POST /notify: Send notifications to users
 * - POST /reassign: Reassign/rotate CRM or Auditor assignments
 *
 * ⚠️ RBAC: Requires ADMIN role
 * ⚠️ Transaction-safe: Uses TypeORM transactions with pessimistic locking
 */
@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/actions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminActionsController {
  constructor(private readonly svc: AdminActionsService) {}

  /**
   * POST /api/admin/actions/notify
   *
   * Send notification to a user
   *
   * Body:
   * - targetRole: ADMIN | CRM | AUDITOR | LEGITX | CONTRACTOR | PAYROLL | CCO | CEO
   * - targetUserId: UUID of recipient user
   * - clientId (optional): UUID of client
   * - branchId (optional): UUID of branch
   * - contextType: AUDIT | ASSIGNMENT | COMPLIANCE | SYSTEM
   * - contextRefId: Reference ID for context
   * - queryType (optional): TECHNICAL | COMPLIANCE | AUDIT | SYSTEM
   * - subject: Notification subject
   * - message: Notification message body
   *
   * Returns:
   * - status: 'SENT'
   * - notificationId: UUID of created notification
   */
  @ApiOperation({ summary: 'Notify' })
  @Post('notify')
  notify(@CurrentUser() user: ReqUser, @Body() dto: AdminNotifyDto) {
    return this.svc.notify(
      { id: user.id, role: user.roleCode, roleCode: user.roleCode },
      dto,
    );
  }

  /**
   * POST /api/admin/actions/reassign
   *
   * Reassign or rotate CRM/Auditor assignment for a client
   *
   * Body:
   * - assignmentType: 'CRM' | 'AUDITOR'
   * - clientId: UUID of client
   * - oldUserId (optional): UUID of current assignee (for validation)
   * - newUserId: UUID of new assignee
   * - effectiveDate (optional): YYYY-MM-DD (defaults to today)
   * - reason: Reason for reassignment
   * - notifyParties (optional): Send notifications to old/new assignees
   *
   * Returns:
   * - status: 'UPDATED' | 'NO_CHANGE'
   * - assignmentId: UUID of assignment record
   * - rotationNextDueOn: YYYY-MM-DD (CRM: +12mo, AUDITOR: +4mo)
   *
   * ⚠️ Transaction-safe with pessimistic write lock
   * ⚠️ Unique index prevents duplicate ACTIVE assignments
   */
  @ApiOperation({ summary: 'Reassign' })
  @Post('reassign')
  reassign(@CurrentUser() user: ReqUser, @Body() dto: AdminReassignDto) {
    return this.svc.reassign({ id: user.id, role: user.roleCode }, dto);
  }
}
