import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { ClientReturnsVisibilityService } from '../services/client-returns-visibility.service';

@ApiTags('Client Returns Visibility')
@ApiBearerAuth('JWT')
@Controller({ path: 'client', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CLIENT')
export class ClientReturnsVisibilityController {
  constructor(
    private readonly clientVisibilityService: ClientReturnsVisibilityService,
  ) {}

  @Get('returns-visibility/:clientId')
  @ApiOperation({ summary: 'Get return tasks for client visibility' })
  async getReturns(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.clientVisibilityService.getReturns(clientId, branchId);
  }

  @Get('expiry-visibility/:clientId')
  @ApiOperation({ summary: 'Get renewal tasks for client visibility' })
  async getExpiry(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.clientVisibilityService.getExpiry(clientId, branchId);
  }

  @Get('compliance-summary/:clientId')
  @ApiOperation({ summary: 'Get client compliance summary' })
  async getSummary(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.clientVisibilityService.getComplianceSummary(
      clientId,
      branchId,
    );
  }

  @Get('compliance-calendar/me')
  @ApiOperation({ summary: 'Get my compliance calendar (clientId from JWT)' })
  async getMyCalendar(
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    if (!user.clientId) throw new BadRequestException('User has no client');
    return this.clientVisibilityService.getCalendar(user.clientId, branchId);
  }

  @Get('compliance-calendar/:clientId')
  @ApiOperation({ summary: 'Get client compliance calendar feed' })
  async getCalendar(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.clientVisibilityService.getCalendar(clientId, branchId);
  }

  @Get('compliance-reminders/:clientId')
  @ApiOperation({ summary: 'Get client compliance reminders' })
  async getReminders(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.clientVisibilityService.getReminders(clientId, branchId);
  }
}
