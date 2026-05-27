import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import {
  UploadComplianceDocDto,
  MarkNotApplicableDto,
  ChecklistQueryDto,
} from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import {
  makeSafeUploadOptions,
  assertSafeFile,
} from '../../common/safe-upload';

type UploadedFile = { originalname: string; buffer: Buffer; mimetype: string };

const uploadOptions = makeSafeUploadOptions({ memory: true, maxMb: 10 });

function parseMonthKey(monthKey?: string): { year?: number; month?: number } {
  if (!monthKey) return {};
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return {};
  return { year: Number(match[1]), month: Number(match[2]) };
}

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH')
export class BranchComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** Get checklist of required documents with current status */
  @ApiOperation({ summary: 'Get Checklist' })
  @Get('checklist')
  getChecklist(@CurrentUser() user: ReqUser, @Query() q: ChecklistQueryDto) {
    return this.svc.getChecklist(user, q);
  }

  /** List uploaded documents */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: ChecklistQueryDto) {
    return this.svc.listForBranch(user, q);
  }

  /** Upload a compliance document */
  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @CurrentUser() user: ReqUser,
    @Body() dto: UploadComplianceDocDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file);
    return this.svc.uploadDocument(user, dto, file);
  }

  /** Mark a compliance item as Not Applicable */
  @ApiOperation({ summary: 'Mark Not Applicable' })
  @Post('mark-not-applicable')
  markNotApplicable(
    @CurrentUser() user: ReqUser,
    @Body() dto: MarkNotApplicableDto,
  ) {
    return this.svc.markNotApplicable(user, dto);
  }

  /** Get return master list (for dropdowns) */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: Record<string, string>) {
    return this.svc.getReturnMaster(q);
  }

  /** Get branch dashboard KPIs for compliance docs */
  @ApiOperation({ summary: 'Dashboard Kpis' })
  @Get('dashboard-kpis')
  async dashboardKpis(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const branchId = await this.svc.resolveBranchId(user, q.branchId);
    const period = parseMonthKey(q.monthKey);
    const year = q.year
      ? Number(q.year)
      : period.year || new Date().getFullYear();
    const month = q.month ? Number(q.month) : period.month;
    return this.svc.getBranchDashboardKpis(user, branchId, year, month);
  }

  /** Get weighted compliance scoring breakdown across all frequencies */
  @ApiOperation({ summary: 'Weighted Compliance' })
  @Get('weighted-compliance')
  async weightedCompliance(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const branchId = await this.svc.resolveBranchId(user, q.branchId);
    await this.svc.assertBranchAccess(user, branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.calculateWeightedCompliance(branchId, user.clientId!, year);
  }

  /** Unified compliance dashboard — KPIs + trend + risk + badges */
  @ApiOperation({ summary: 'Full Dashboard' })
  @Get('dashboard/full')
  async fullDashboard(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const branchId = await this.svc.resolveBranchId(user, q.branchId);
    await this.svc.assertBranchAccess(user, branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.getBranchComplianceDashboard(user, branchId, year);
  }

  /** 12-month compliance trend for the branch */
  @ApiOperation({ summary: 'Compliance Trend' })
  @Get('trend')
  async complianceTrend(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const branchId = await this.svc.resolveBranchId(user, q.branchId);
    await this.svc.assertBranchAccess(user, branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.getComplianceTrend(branchId, user.clientId!, year);
  }

  /** Risk exposure score for the branch */
  @ApiOperation({ summary: 'Risk Exposure' })
  @Get('risk')
  async riskExposure(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const branchId = await this.svc.resolveBranchId(user, q.branchId);
    await this.svc.assertBranchAccess(user, branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.calculateRiskExposure(branchId, user.clientId!, year);
  }

  /** Sidebar badge counts per frequency (overdue + reupload) */
  @ApiOperation({ summary: 'Sidebar Badges' })
  @Get('badges')
  async sidebarBadges(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    const branchId = await this.svc.resolveBranchId(user, q.branchId);
    await this.svc.assertBranchAccess(user, branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.getSidebarBadges(branchId, user.clientId!, year);
  }
}
