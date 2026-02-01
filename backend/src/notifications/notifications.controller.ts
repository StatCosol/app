import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ReplyNotificationDto } from './dto/reply-notification.dto';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly svc: NotificationsService,
  ) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateNotificationDto) {
    return this.svc.createTicket(user.id, user.roleCode, dto);
  }

  @Get('inbox')
  inbox(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listTicketsForUser(user, q);
  }

  @Get('my')
  my(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listTicketsCreatedBy(user, q);
  }

  @Get('threads/:threadId')
  thread(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.getThreadDetailForUser(user, threadId);
  }

  @Post('threads/:threadId/reply')
  reply(@CurrentUser() user: any, @Param('threadId') threadId: string, @Body() dto: ReplyNotificationDto) {
    return this.svc.replyAsUser(user, threadId, dto);
  }

  @Post('threads/:threadId/close')
  close(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.closeThread(user, threadId);
  }

  @Post('threads/:threadId/reopen')
  reopen(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.reopenThread(user, threadId);
  }

  @Post('threads/:threadId/read')
  markRead(@CurrentUser() user: any, @Param('threadId') threadId: string) {
    return this.svc.markRead(threadId, user.id);
  }
}
