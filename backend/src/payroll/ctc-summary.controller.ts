import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { CtcSummaryService } from './ctc-summary.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/* ─── Client CTC Summary ─── */
@Controller({ path: 'client/payroll/ctc-summary', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
@ApiTags('CTC Summary')
@ApiBearerAuth()
export class ClientCtcSummaryController {
  constructor(private readonly svc: CtcSummaryService) {}

  /** Consolidated + branch-wise CTC for a given month/year */
  @ApiOperation({ summary: 'Client CTC Summary' })
  @Get()
  getSummary(
    @CurrentUser() user: ReqUser,
    @Query('year') year: string,
    @Query('month') month?: string,
  ) {
    return this.svc.getClientCtcSummary(
      user,
      +year,
      month ? +month : undefined,
    );
  }

  /** Year-to-date totals for the client */
  @ApiOperation({ summary: 'Client YTD CTC' })
  @Get('ytd')
  getYtd(@CurrentUser() user: ReqUser, @Query('year') year: string) {
    return this.svc.getClientYtd(user, +year);
  }

  /** Month-wise trend for the selected year */
  @ApiOperation({ summary: 'Client Monthly Trend' })
  @Get('trend')
  getTrend(@CurrentUser() user: ReqUser, @Query('year') year: string) {
    return this.svc.getClientMonthlyTrend(user, +year);
  }
}

/* ─── Branch CTC ─── */
@Controller({ path: 'branch/payroll/ctc', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
@ApiTags('CTC Summary')
@ApiBearerAuth()
export class BranchCtcController {
  constructor(private readonly svc: CtcSummaryService) {}

  /** Branch-level CTC for a given month/year */
  @ApiOperation({ summary: 'Branch CTC Summary' })
  @Get()
  getSummary(
    @CurrentUser() user: ReqUser,
    @Query('year') year: string,
    @Query('month') month?: string,
  ) {
    return this.svc.getBranchCtcSummary(
      user,
      +year,
      month ? +month : undefined,
    );
  }

  /** Year-to-date totals for the branch */
  @ApiOperation({ summary: 'Branch YTD CTC' })
  @Get('ytd')
  getYtd(@CurrentUser() user: ReqUser, @Query('year') year: string) {
    return this.svc.getBranchYtd(user, +year);
  }

  /** Month-wise trend for the selected year */
  @ApiOperation({ summary: 'Branch Monthly Trend' })
  @Get('trend')
  getTrend(@CurrentUser() user: ReqUser, @Query('year') year: string) {
    return this.svc.getBranchMonthlyTrend(user, +year);
  }
}
