import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import {
  CompliancePctService,
  BranchPctRow,
  PctSummary,
} from './services/compliance-pct.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * /api/v1/compliance-pct
 *
 * Canonical, unified compliance-percentage endpoints.
 * Consumers should prefer these over the older per-service duplicates.
 */
@ApiTags('Common')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compliance-pct')
export class CompliancePctController {
  constructor(private readonly pctSvc: CompliancePctService) {}

  @Version('1')
  @ApiOperation({ summary: 'Branch Pct' })
  @Get('branch/:branchId')
  @Roles('CRM', 'CLIENT', 'BRANCH', 'ADMIN', 'CCO', 'CEO')
  branchPct(
    @Param('branchId') branchId: string,
    @Query('month') month?: string,
  ): Promise<PctSummary> {
    return this.pctSvc.branchPct(branchId, month);
  }

  @Version('1')
  @ApiOperation({ summary: 'Branch Weighted' })
  @Get('branch/:branchId/weighted')
  @Roles('CRM', 'CLIENT', 'BRANCH', 'ADMIN', 'CCO', 'CEO')
  async branchWeighted(
    @Param('branchId') branchId: string,
    @Query('month') month?: string,
  ): Promise<{ compliancePct: number }> {
    const pct = await this.pctSvc.branchWeightedPct(branchId, month);
    return { compliancePct: pct };
  }

  @Version('1')
  @ApiOperation({ summary: 'Client Overall' })
  @Get('client/:clientId')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  clientOverall(
    @Param('clientId') clientId: string,
    @Query('month') month?: string,
  ): Promise<PctSummary> {
    return this.pctSvc.clientOverallPct(clientId, month);
  }

  @Version('1')
  @ApiOperation({ summary: 'Client Branches' })
  @Get('client/:clientId/branches')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  clientBranches(
    @Param('clientId') clientId: string,
    @Query('month') month?: string,
  ): Promise<BranchPctRow[]> {
    return this.pctSvc.clientBranchesPct(clientId, month);
  }

  @Version('1')
  @ApiOperation({ summary: 'Lowest Branches' })
  @Get('client/:clientId/lowest')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  lowestBranches(
    @Param('clientId') clientId: string,
    @Query('month') month?: string,
    @Query('limit') limit?: string,
  ): Promise<BranchPctRow[]> {
    return this.pctSvc.lowestBranches(clientId, month, Number(limit) || 5);
  }
}
