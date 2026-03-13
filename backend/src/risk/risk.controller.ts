import {
  Controller,
  Get,
  Query,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RiskService } from './risk.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Risk')
@ApiBearerAuth('JWT')
@Controller({ path: 'risk', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class RiskController {
  constructor(
    private readonly riskService: RiskService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  /**
   * GET /api/v1/risk/heatmap?month=YYYY-MM&clientId=...
   */
  @ApiOperation({ summary: 'Heatmap' })
  @Get('heatmap')
  async heatmap(
    @Query('month') month: string,
    @Query('clientId') queryClientId: string,
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;
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
      clientId = user.clientId;
      if (!clientId) throw new ForbiddenException('Client not mapped');
      branchIds = user.branchIds ?? [];
    } else if (roleCode === 'CRM') {
      clientId = queryClientId;
      if (!clientId) throw new ForbiddenException('clientId required for CRM');
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.sub ?? user.userId,
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
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;
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
