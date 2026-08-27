import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskDashboardService } from './facedesk-dashboard.service';
import { FaceDeskReportsService } from './facedesk-reports.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { UpdateSettingsDto } from './facedesk.dto';
import {
  facedeskBranchScope,
  facedeskReportRange,
  requireFaceDeskClient,
} from './facedesk-controller.helpers';

@ApiTags('FaceDesk V2')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk', version: '1' })
export class FaceDeskReportsController {
  constructor(
    private readonly dashboard: FaceDeskDashboardService,
    private readonly reports: FaceDeskReportsService,
    private readonly settings: FaceDeskSettingsService,
  ) {}

  @ApiOperation({ summary: 'Dashboard cards' })
  @Get('dashboard')
  @Roles('CLIENT', 'ADMIN')
  dashboardCards(@CurrentUser() user: ReqUser) {
    const branchIds = facedeskBranchScope(user);
    return this.dashboard.cards(
      requireFaceDeskClient(user),
      branchIds,
    );
  }

  @ApiOperation({ summary: 'Daily attendance report' })
  @Get('reports/daily')
  @Roles('CLIENT', 'ADMIN')
  reportDaily(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.dailyAttendance(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Employee-wise attendance report' })
  @Get('reports/employee')
  @Roles('CLIENT', 'ADMIN')
  reportEmployee(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.employeeSummary(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Worked-hours report (all punches + day units)' })
  @Get('reports/worked-hours')
  @Roles('CLIENT', 'ADMIN')
  reportWorkedHours(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.workedHoursSummary(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Branch-wise attendance report' })
  @Get('reports/branch')
  @Roles('CLIENT', 'ADMIN')
  reportBranch(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.branchSummary(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Late coming report' })
  @Get('reports/late')
  @Roles('CLIENT', 'ADMIN')
  reportLate(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.lateComing(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Early going report' })
  @Get('reports/early')
  @Roles('CLIENT', 'ADMIN')
  reportEarly(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.earlyGoing(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Absent report' })
  @Get('reports/absent')
  @Roles('CLIENT', 'ADMIN')
  reportAbsent(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.absent(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Failed face attempts report' })
  @Get('reports/failed')
  @Roles('CLIENT', 'ADMIN')
  reportFailed(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.failedAttempts(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Duplicate enrollment report' })
  @Get('reports/duplicates')
  @Roles('CLIENT', 'ADMIN')
  reportDuplicates(@CurrentUser() user: ReqUser) {
    return this.reports.duplicateReport(requireFaceDeskClient(user));
  }

  @ApiOperation({ summary: 'Pending enrollment report' })
  @Get('reports/pending-enrollment')
  @Roles('CLIENT', 'ADMIN')
  reportPending(@CurrentUser() user: ReqUser) {
    return this.reports.pendingEnrollment(
      requireFaceDeskClient(user),
      facedeskBranchScope(user) ?? undefined,
    );
  }

  @ApiOperation({ summary: 'Device sync report' })
  @Get('reports/device-sync')
  @Roles('CLIENT', 'ADMIN')
  reportDeviceSync(@CurrentUser() user: ReqUser) {
    return this.reports.deviceSyncReport(requireFaceDeskClient(user));
  }

  @ApiOperation({ summary: 'Payroll attendance export (approved only)' })
  @Get('reports/payroll-export')
  @Roles('CLIENT', 'ADMIN')
  payrollExport(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.payrollExport(
      requireFaceDeskClient(user),
      facedeskReportRange(user, from, to),
    );
  }

  @ApiOperation({ summary: 'Push approved attendance to payroll (PayDek)' })
  @Post('payroll/sync')
  @Roles('CLIENT', 'ADMIN')
  payrollSync(
    @CurrentUser() user: ReqUser,
    @Body() body: { from?: string; to?: string },
  ) {
    return this.reports.pushToPayroll(requireFaceDeskClient(user), {
      from: body?.from,
      to: body?.to,
    });
  }

  @ApiOperation({ summary: 'Get FaceDesk settings (percentages)' })
  @Get('settings')
  @Roles('CLIENT', 'ADMIN')
  async getSettings(@CurrentUser() user: ReqUser) {
    return this.settings.getEffective(requireFaceDeskClient(user));
  }

  @ApiOperation({ summary: 'Update FaceDesk settings' })
  @Put('settings')
  @Roles('CLIENT', 'ADMIN')
  async updateSettings(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    const clientId = requireFaceDeskClient(user);
    await this.settings.upsert(clientId, dto);
    return this.settings.getEffective(clientId);
  }
}
