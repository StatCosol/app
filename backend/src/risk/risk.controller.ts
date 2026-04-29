import {
  Controller,
  Get,
  Post,
  Query,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RiskService } from './risk.service';
import { RiskSnapshotCronService } from './risk-snapshot-cron.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Risk')
@ApiBearerAuth('JWT')
@Controller({ path: 'risk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class RiskController {
  constructor(
    private readonly riskService: RiskService,
    private readonly assignmentsService: AssignmentsService,
    private readonly riskSnapshotCron: RiskSnapshotCronService,
  ) {}

  /**
   * POST /api/v1/risk/snapshot-now
   * Admin-only manual trigger for the daily risk snapshot job.
   * Useful to populate trend data on demand without waiting for the 1 AM cron.
   */
  @ApiOperation({ summary: 'Manually trigger daily risk snapshot (admin only)' })
  @Post('snapshot-now')
  @Roles('ADMIN', 'CCO', 'CEO')
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
    const roleCode: string = user.roleCode;

    if (roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    if (!month) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    let clientId: string;
    let branchIds: string[] = [];

    if (roleCode === 'CLIENT') {
      clientId = user.clientId!;
      if (!clientId) throw new ForbiddenException('Client not mapped');
      branchIds = user.branchIds ?? [];
    } else if (roleCode === 'CRM') {
      clientId = queryClientId;
      if (!clientId) throw new ForbiddenException('clientId required for CRM');
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned to you');
    } else {
      clientId = queryClientId;
      if (!clientId) return { branches: [], month }; // Admin with no client filter → empty heatmap
    }

    return this.riskService.getHeatmap({ clientId, branchIds, month });
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
    const roleCode: string = user.roleCode;

    if (roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    if (!branchId || !from || !to) {
      throw new ForbiddenException('branchId, from, and to are required');
    }

    // Branch user: verify the branch belongs to them
    if (roleCode === 'CLIENT') {
      const mapped: string[] = user.branchIds ?? [];
      if (mapped.length > 0 && !mapped.includes(branchId)) {
        throw new ForbiddenException('Branch not accessible');
      }
    }

    return this.riskService.getTrend({ branchId, from, to });
  }
}
