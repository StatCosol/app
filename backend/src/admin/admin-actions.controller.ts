import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminActionsService } from './admin-actions.service';
import { AdminNotifyDto } from './dto/admin-notify.dto';
import { AdminReassignDto } from './dto/admin-reassign.dto';

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
@Controller({ path: 'admin/actions', version: '1' })
@UseGuards(RolesGuard)
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
  @Post('notify')
  notify(@Req() req: any, @Body() dto: AdminNotifyDto) {
    return this.svc.notify(req.user, dto);
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
  @Post('reassign')
  reassign(@Req() req: any, @Body() dto: AdminReassignDto) {
    return this.svc.reassign(req.user, dto);
  }
}
