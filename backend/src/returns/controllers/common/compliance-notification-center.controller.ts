import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { ComplianceNotificationCenterService } from '../../services/compliance-notification-center.service';

@ApiTags('Compliance Notification Center')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'compliance-notifications', version: '1' })
export class ComplianceNotificationCenterController {
  constructor(
    private readonly notificationService: ComplianceNotificationCenterService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications by role/client/branch' })
  async getNotifications(
    @Query('role') role: string,
    @Query('clientId') clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.notificationService.getNotifications(role, clientId, branchId);
  }

  @Get('badge')
  @ApiOperation({ summary: 'Get notification badge summary' })
  async getBadge(
    @Query('role') role: string,
    @Query('clientId') clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.notificationService.getBadge(role, clientId, branchId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.markRead(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create notification entry' })
  async create(
    @Body()
    body: Partial<{
      clientId: string;
      branchId: string;
      role: string;
      module: string;
      title: string;
      message: string;
      priority: string;
      entityId: string;
      entityType: string;
      dueDate: string;
    }>,
  ) {
    const payload: any = { ...body };
    if (payload.dueDate) payload.dueDate = new Date(payload.dueDate);
    return this.notificationService.createNotification(payload);
  }
}
