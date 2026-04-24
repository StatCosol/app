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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/notifications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@CurrentUser() user: ReqUser, @Query() q: ListNotificationsDto) {
    return this.notificationsService.listTicketsForAdmin(user.id, q);
  }

  @ApiOperation({ summary: 'Detail' })
  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.notificationsService.getTicketDetailForAdmin(id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  async create(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationsService.createTicket(user.id, user.roleCode, dto);
  }

  @ApiOperation({ summary: 'Reply' })
  @Post(':id/reply')
  async reply(
    @CurrentUser() user: ReqUser,
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

  @ApiOperation({ summary: 'Mark Read' })
  @Post(':id/read')
  async markRead(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user.id);
  }

  @ApiOperation({ summary: 'Set Status' })
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.notificationsService.setStatus(id, body.status);
  }
}
