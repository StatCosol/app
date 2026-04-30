import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsInboxService } from './notifications-inbox.service';
import { NotificationListQueryDto } from './dto/notification-list.dto';
import { NotificationStatusDto } from './dto/notification-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/**
 * Notifications Inbox Controller
 *
 * Endpoints for inbox/outbox management
 * All routes require authentication via RolesGuard
 */
@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsInboxController {
  constructor(private readonly svc: NotificationsInboxService) {}

  /**
   * GET /api/notifications/list
   *
   * List notifications for current user
   *
   * Query params:
   * - box (optional): 'INBOX' | 'OUTBOX' (default: INBOX)
   * - status (optional): 'UNREAD' | 'READ' | 'CLOSED'
   * - queryType (optional): 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'SYSTEM'
   * - clientId (optional): UUID
   * - branchId (optional): UUID
   * - search (optional): Text search in subject/message
   * - fromDate (optional): YYYY-MM-DD
   * - toDate (optional): YYYY-MM-DD
   * - limit (optional, default 200, max 500)
   * - offset (optional, default 0)
   *
   * UI Tabs:
   * - Inbox (unread): ?box=INBOX&status=UNREAD
   * - Inbox (all): ?box=INBOX
   * - Sent: ?box=OUTBOX
   * - Closed: ?box=INBOX&status=CLOSED
   *
   * Returns array of notifications with sender/recipient details
   */
  @ApiOperation({ summary: 'List' })
  @Get('list')
  list(
    @CurrentUser() user: ReqUser,
    @Query() q: NotificationListQueryDto & { view?: string },
  ) {
    const normalized: NotificationListQueryDto = { ...q };
    if (q.view && !q.box) {
      const v = String(q.view).toUpperCase();
      normalized.box = v === 'OUTBOX' ? 'OUTBOX' : 'INBOX';
    }
    return this.svc.list({ id: user.id, role: user.roleCode }, normalized);
  }

  /**
   * GET /api/notifications/:id
   *
   * Get notification detail by ID
   * Only accessible to sender or recipient
   *
   * Returns full notification details with user/client/branch names
   */
  @ApiOperation({ summary: 'Get' })
  @Get(':id')
  get(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getById({ id: user.id, role: user.roleCode }, id);
  }

  /**
   * PATCH /api/notifications/:id/status
   *
   * Update notification status
   * Only recipient can update status
   *
   * Body:
   * - status: 'UNREAD' | 'READ' | 'CLOSED'
   *
   * Auto-updates read_at timestamp when status changes to READ
   */
  @ApiOperation({ summary: 'Set Status' })
  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotificationStatusDto,
  ) {
    return this.svc.setStatus({ id: user.id, role: user.roleCode }, id, dto);
  }
}
