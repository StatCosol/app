import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsInboxService } from './notifications-inbox.service';
import { NotificationListQueryDto } from './dto/notification-list.dto';
import { NotificationStatusDto } from './dto/notification-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Notifications Inbox Controller
 *
 * Endpoints for inbox/outbox management
 * All routes require authentication via RolesGuard
 */
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
  @Get('list')
  list(
    @Req() req: any,
    @Query() q: NotificationListQueryDto & { view?: string },
  ) {
    const normalized = { ...q } as any;
    if (q.view && !q.box) {
      const v = String(q.view).toUpperCase();
      normalized.box = v === 'OUTBOX' ? 'OUTBOX' : 'INBOX';
    }
    return this.svc.list(req.user, normalized);
  }

  /**
   * GET /api/notifications/:id
   *
   * Get notification detail by ID
   * Only accessible to sender or recipient
   *
   * Returns full notification details with user/client/branch names
   */
  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.svc.getById(req.user, id);
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
  @Patch(':id/status')
  setStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: NotificationStatusDto,
  ) {
    return this.svc.setStatus(req.user, id, dto);
  }
}
