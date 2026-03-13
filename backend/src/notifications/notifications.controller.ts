import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ReplyNotificationDto } from './dto/reply-notification.dto';
import { RaiseNotificationDto } from './dto/raise-notification.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // -------------------------
  // Thread-based notification system (existing)
  // -------------------------

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateNotificationDto) {
    return this.svc.createTicket(user.id, user.roleCode, dto);
  }

  @ApiOperation({ summary: 'Inbox' })
  @Get('inbox')
  inbox(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listTicketsForUser(user, q);
  }

  @ApiOperation({ summary: 'My' })
  @Get('my')
  my(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listTicketsCreatedBy(user, q);
  }

  @ApiOperation({ summary: 'Thread' })
  @Get('threads/:threadId')
  thread(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.getThreadDetailForUser(user, threadId);
  }

  @ApiOperation({ summary: 'Thread Reply' })
  @Post('threads/:threadId/reply')
  threadReply(
    @CurrentUser() user: any,
    @Param('threadId') threadId: string,
    @Body() dto: ReplyNotificationDto,
  ) {
    return this.svc.replyAsUser(user, threadId, dto);
  }

  @ApiOperation({ summary: 'Close' })
  @Post('threads/:threadId/close')
  close(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.closeThread(user, threadId);
  }

  @ApiOperation({ summary: 'Reopen' })
  @Post('threads/:threadId/reopen')
  reopen(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.reopenThread(user, threadId);
  }

  @ApiOperation({ summary: 'Mark Read' })
  @Post('threads/:threadId/read')
  markRead(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.markRead(threadId, user.id);
  }

  // -------------------------
  // Simple notification system (new - direct routing)
  // -------------------------

  /**
   * POST /api/notifications/raise
   *
   * Raise a notification with automatic recipient routing
   * Any logged-in user can raise queries
   *
   * Routing:
   * - TECHNICAL → ADMIN
   * - COMPLIANCE → CRM (fallback: ADMIN)
   * - AUDIT → AUDITOR (fallback: ADMIN)
   *
   * Body:
   * - queryType: 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT'
   * - subject: string
   * - message: string
   * - clientId (optional): UUID (required for COMPLIANCE/AUDIT)
   * - branchId (optional): UUID
   * - contextType (optional): 'AUDIT' | 'ASSIGNMENT' | 'COMPLIANCE' | 'SYSTEM'
   * - contextRefId (optional): string
   *
   * Returns:
   * - status: 'SENT'
   * - notificationId: UUID
   * - routedToRole: string (ADMIN/CRM/AUDITOR)
   * - routedToUserId: UUID
   */
  @ApiOperation({ summary: 'Raise' })
  @Post('raise')
  raise(@CurrentUser() user: any, @Body() dto: RaiseNotificationDto) {
    return this.svc.raise(user, dto);
  }

  /**
   * POST /api/notifications/:id/reply
   *
   * Reply to a notification
   * Creates a new notification that goes back to the original sender
   * Marks parent as READ
   *
   * Params:
   * - id: Parent notification UUID
   *
   * Body:
   * - message: string
   *
   * Returns:
   * - status: 'SENT'
   * - notificationId: UUID of reply
   */
  @ApiOperation({ summary: 'Reply' })
  @Post(':id/reply')
  reply(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    return this.svc.reply(user, id, body.message);
  }
}
