import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ReplyNotificationDto } from './dto/reply-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller({ path: 'admin/notifications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: any, @Query() q: ListNotificationsDto) {
    return this.notificationsService.listTicketsForAdmin(user.id, q);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.notificationsService.getTicketDetailForAdmin(id);
  }

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.createTicket(user.id, user.roleCode, dto);
  }

  @Post(':id/reply')
  async reply(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReplyNotificationDto,
  ) {
    return this.notificationsService.replyAsAdmin(
      user.id,
      user.roleCode,
      id,
      dto,
    );
  }

  @Post(':id/read')
  async markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.notificationsService.setStatus(id, body.status);
  }
}
