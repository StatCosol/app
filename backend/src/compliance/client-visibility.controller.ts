import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientVisibilityService } from './client-visibility.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Client – Visibility')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/visibility', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CLIENT')
export class ClientVisibilityController {
  constructor(private readonly visibilityService: ClientVisibilityService) {}

  @ApiOperation({ summary: 'Returns filing summary by law type' })
  @Get('returns-summary')
  async returnsSummary(@CurrentUser() user: ReqUser) {
    return this.visibilityService.getReturnsSummary(user.clientId!);
  }

  @ApiOperation({ summary: 'Upcoming renewals (next 90 days)' })
  @Get('renewals')
  async renewals(@CurrentUser() user: ReqUser) {
    return this.visibilityService.getRenewals(user.clientId!);
  }

  @ApiOperation({ summary: 'Compliance calendar for a month' })
  @Get('calendar')
  async calendar(
    @CurrentUser() user: ReqUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.visibilityService.getComplianceCalendar(
      user.clientId!,
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @ApiOperation({ summary: 'Compliance reminders (upcoming deadlines)' })
  @Get('reminders')
  async reminders(
    @CurrentUser() user: ReqUser,
    @Query('days') days?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.visibilityService.getReminders(
      user.clientId!,
      days ? parseInt(days, 10) : 30,
      branchId,
    );
  }
}
