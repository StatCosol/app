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
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import type { ReqUser } from '../../../access/access-scope.service';
import { ComplianceNotificationCenterService } from '../../services/compliance-notification-center.service';

@ApiTags('Compliance Notification Center')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'compliance-notifications', version: '1' })
export class ComplianceNotificationCenterController {
  constructor(
    private readonly notificationService: ComplianceNotificationCenterService,
  ) {}

  /**
   * `role` and `clientId` used to come straight off the query string with no
   * reference to the caller, on a controller carrying no @Roles at all — so
   * any authenticated user could read any client's compliance notifications
   * by changing a parameter, and omitting clientId returned every client's.
   *
   * Both are now derived from the token. A tenant user is pinned to their own
   * client; an assignment-scoped user must name one of theirs, which
   * ScopeGuard then verifies.
   */
  @Get()
  @ApiOperation({ summary: 'Get notifications for the caller' })
  async getNotifications(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.notificationService.getNotifications(
      user.roleCode,
      this.resolveClientId(user, clientId),
      branchId,
    );
  }

  @Get('badge')
  @ApiOperation({ summary: 'Get notification badge summary for the caller' })
  async getBadge(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.notificationService.getBadge(
      user.roleCode,
      this.resolveClientId(user, clientId),
      branchId,
    );
  }

  /**
   * A tenant user's own client always wins over anything they send. For every
   * other role the requested clientId is used and validated by ScopeGuard;
   * returning undefined for a global role preserves the cross-client view they
   * are entitled to.
   */
  private resolveClientId(
    user: ReqUser,
    requested?: string,
  ): string | undefined {
    if (user?.clientId) return user.clientId;
    return requested || undefined;
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
