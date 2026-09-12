import {
  Controller,
  Get,
  Post,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RiskService } from './risk.service';
import { RiskSnapshotCronService } from './risk-snapshot-cron.service';
import { OperationalScopeService } from '../access/operational-scope.service';
import { operationalDate, validCalendarDate } from '../common/operational-date';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Risk')
@ApiBearerAuth('JWT')
@Controller({ path: 'risk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT', 'BRANCH_DESK')
export class RiskController {
  constructor(
    private readonly riskService: RiskService,
    private readonly scope: OperationalScopeService,
    private readonly riskSnapshotCron: RiskSnapshotCronService,
  ) {}

  /**
   * POST /api/v1/risk/snapshot-now
   * Admin/CEO manual trigger for the daily risk snapshot job.
   * Useful to populate trend data on demand without waiting for the 1 AM cron.
   */
  @ApiOperation({
    summary: 'Manually trigger daily risk snapshot (Admin/CEO only)',
  })
  @Post('snapshot-now')
  @Roles('ADMIN', 'CEO')
  async snapshotNow(): Promise<{ ok: true; message: string }> {
    await this.riskSnapshotCron.snapshotDaily();
    return { ok: true, message: 'Risk snapshot completed.' };
  }

  /**
   * GET /api/v1/risk/heatmap?month=YYYY-MM&clientId=...
   */
  @ApiOperation({ summary: 'Heatmap' })
  @Get('heatmap')
  async heatmap(
    @Query('month') month: string,
    @Query('clientId') queryClientId: string,
    @CurrentUser() user: ReqUser,
  ): Promise<any> {
    month ||= operationalDate().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException('month must be YYYY-MM');
    const clientId = queryClientId || user.clientId;
    const scope = await this.scope.resolve(user, clientId);
    if (!clientId) return { branches: [], month };
    return this.riskService.getHeatmap({
      clientId,
      branchIds: scope.level === 'branches' ? scope.branchIds || [] : undefined,
      month,
    });
  }

  /**
   * GET /api/v1/risk/trend?branchId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
   */
  @ApiOperation({ summary: 'Trend' })
  @Get('trend')
  async trend(
    @Query('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: ReqUser,
  ): Promise<any> {
    if (!branchId) throw new BadRequestException('branchId is required');
    if (!validCalendarDate(from) || !validCalendarDate(to) || from > to)
      throw new BadRequestException('Use a valid date range');
    await this.scope.resolve(user, undefined, branchId);
    return this.riskService.getTrend({ branchId, from, to });
  }
}
