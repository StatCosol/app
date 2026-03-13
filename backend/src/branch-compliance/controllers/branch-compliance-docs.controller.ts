import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import {
  UploadComplianceDocDto,
  ChecklistQueryDto,
} from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

type UploadedFile = { originalname: string; buffer: Buffer; mimetype: string };

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class BranchComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** Get checklist of required documents with current status */
  @ApiOperation({ summary: 'Get Checklist' })
  @Get('checklist')
  getChecklist(@Req() req: any, @Query() q: ChecklistQueryDto) {
    return this.svc.getChecklist(req.user, q);
  }

  /** List uploaded documents */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: ChecklistQueryDto) {
    return this.svc.listForBranch(req.user, q);
  }

  /** Upload a compliance document */
  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  upload(
    @Req() req: any,
    @Body() dto: UploadComplianceDocDto,
    @UploadedFile() file: any,
  ) {
    return this.svc.uploadDocument(req.user, dto, file);
  }

  /** Get return master list (for dropdowns) */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: any) {
    return this.svc.getReturnMaster(q);
  }

  /** Get branch dashboard KPIs for compliance docs */
  @ApiOperation({ summary: 'Dashboard Kpis' })
  @Get('dashboard-kpis')
  async dashboardKpis(@Req() req: any, @Query() q: any) {
    const branchId = await this.svc.resolveBranchId(req.user, q.branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const month = q.month ? Number(q.month) : undefined;
    return this.svc.getBranchDashboardKpis(req.user, branchId, year, month);
  }

  /** Get weighted compliance scoring breakdown across all frequencies */
  @ApiOperation({ summary: 'Weighted Compliance' })
  @Get('weighted-compliance')
  async weightedCompliance(@Req() req: any, @Query() q: any) {
    const branchId = await this.svc.resolveBranchId(req.user, q.branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.calculateWeightedCompliance(
      branchId,
      req.user.clientId,
      year,
    );
  }

  /** Unified compliance dashboard — KPIs + trend + risk + badges */
  @ApiOperation({ summary: 'Full Dashboard' })
  @Get('dashboard/full')
  async fullDashboard(@Req() req: any, @Query() q: any) {
    const branchId = await this.svc.resolveBranchId(req.user, q.branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.getBranchComplianceDashboard(req.user, branchId, year);
  }

  /** 12-month compliance trend for the branch */
  @ApiOperation({ summary: 'Compliance Trend' })
  @Get('trend')
  async complianceTrend(@Req() req: any, @Query() q: any) {
    const branchId = await this.svc.resolveBranchId(req.user, q.branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.getComplianceTrend(branchId, req.user.clientId, year);
  }

  /** Risk exposure score for the branch */
  @ApiOperation({ summary: 'Risk Exposure' })
  @Get('risk')
  async riskExposure(@Req() req: any, @Query() q: any) {
    const branchId = await this.svc.resolveBranchId(req.user, q.branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.calculateRiskExposure(branchId, req.user.clientId, year);
  }

  /** Sidebar badge counts per frequency (overdue + reupload) */
  @ApiOperation({ summary: 'Sidebar Badges' })
  @Get('badges')
  async sidebarBadges(@Req() req: any, @Query() q: any) {
    const branchId = await this.svc.resolveBranchId(req.user, q.branchId);
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    return this.svc.getSidebarBadges(branchId, req.user.clientId, year);
  }
}
