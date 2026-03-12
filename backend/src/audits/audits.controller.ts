import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { AuditsService } from './audits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAuditDto } from './dto/create-audit.dto';
import { BranchAccessService } from '../auth/branch-access.service';
import { AuditorAssignmentGuard } from '../assignments/auditor-assignment.guard';
import {
  CrmAssignmentGuard,
  ClientScoped,
} from '../assignments/crm-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// ─── Branch Audit KPI ─────────────────────────────
@ApiTags('Audits')
@ApiBearerAuth('JWT')
@Controller({ path: 'audit-kpi', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT', 'BRANCH', 'AUDITOR')
export class AuditKpiController {
  constructor(
    private readonly svc: AuditsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @ApiOperation({ summary: 'Get Branch Kpi' })
  @Get('branch/:branchId')
  async getBranchKpi(
    @Req() req: any,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (req.user.roleCode === 'CLIENT' || req.user.roleCode === 'BRANCH') {
      await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    }
    return this.svc.getBranchAuditKpi(branchId, from, to);
  }

  @ApiOperation({ summary: 'Get Branch Kpi Single' })
  @Get('branch/:branchId/:periodCode')
  async getBranchKpiSingle(
    @Req() req: any,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('periodCode') periodCode: string,
  ) {
    if (req.user.roleCode === 'CLIENT' || req.user.roleCode === 'BRANCH') {
      await this.branchAccess.assertBranchAccess(req.user.userId, branchId);
    }
    return this.svc.getBranchAuditKpiSingle(branchId, periodCode);
  }
}

@Controller({ path: 'crm/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listForCrm(req.user, q);
  }

  @ApiOperation({ summary: 'Get One' })
  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForCrm(req.user, id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(@Req() req: any, @Body() dto: CreateAuditDto) {
    return this.svc.createForCrm(req.user, dto);
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { status: string; notes?: string },
  ) {
    return this.svc.updateStatus(req.user, id, dto.status, dto.notes);
  }

  @ApiOperation({ summary: 'Assign Auditor / Reschedule' })
  @Post(':id/assign-auditor')
  assignAuditor(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: { assignedAuditorId?: string; dueDate?: string | null; notes?: string | null },
  ) {
    return this.svc.assignAuditorForCrm(req.user, id, dto);
  }

  @ApiOperation({ summary: 'Readiness Snapshot' })
  @Get(':id/readiness')
  readiness(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getReadinessForCrm(req.user, id);
  }

  @ApiOperation({ summary: 'Report Status' })
  @Get(':id/report-status')
  reportStatus(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getReportStatusForCrm(req.user, id);
  }
}

@Controller({ path: 'auditor/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, AuditorAssignmentGuard)
@Roles('AUDITOR')
export class AuditorAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listForAuditor(req.user, q);
  }

  @ApiOperation({ summary: 'Get One' })
  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Calculate Score' })
  @Post(':id/score')
  calculateScore(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.calculateScore(id);
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { status: string; notes?: string },
  ) {
    return this.svc.updateStatus(req.user, id, dto.status, dto.notes);
  }

  @ApiOperation({ summary: 'Get Report Draft' })
  @Get(':id/report')
  getReport(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getReportForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Save Report Draft' })
  @Put(':id/report')
  saveReport(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: {
      version?: 'INTERNAL' | 'CLIENT';
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: string[];
    },
  ) {
    return this.svc.saveReportDraftForAuditor(req.user, id, dto);
  }

  @ApiOperation({ summary: 'Finalize Report Draft' })
  @Post(':id/report/finalize')
  finalizeReport(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.finalizeReportForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Reopen Report Draft' })
  @Post(':id/report/reopen')
  reopenReport(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.reopenReportForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Export Final Report Pdf' })
  @Get(':id/report/export')
  async exportReportPdf(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.svc.exportReportPdfForAuditor(req.user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-report-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}

/**
 * Backward-compatible alias routes for older auditor clients that call
 * /api/v1/audits/* instead of /api/v1/auditor/audits/*.
 */
@Controller({ path: 'audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, AuditorAssignmentGuard)
@Roles('AUDITOR')
export class AuditorAuditsLegacyController {
  constructor(private readonly svc: AuditsService) {}

  @ApiOperation({ summary: 'Legacy List (compat)' })
  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listForAuditor(req.user, q);
  }

  @ApiOperation({ summary: 'Legacy Get One (compat)' })
  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Legacy Update Status (compat)' })
  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { status: string; notes?: string },
  ) {
    return this.svc.updateStatus(req.user, id, dto.status, dto.notes);
  }

  @ApiOperation({ summary: 'Legacy Report Draft (compat)' })
  @Get(':id/report')
  getReport(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getReportForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Legacy Save Report Draft (compat)' })
  @Put(':id/report')
  saveReport(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: {
      version?: 'INTERNAL' | 'CLIENT';
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: string[];
    },
  ) {
    return this.svc.saveReportDraftForAuditor(req.user, id, dto);
  }

  @ApiOperation({ summary: 'Legacy Finalize Report (compat)' })
  @Post(':id/report/finalize')
  finalizeReport(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.finalizeReportForAuditor(req.user, id);
  }

  @ApiOperation({ summary: 'Legacy Export Report (compat)' })
  @Get(':id/report/export')
  async exportReportPdf(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.svc.exportReportPdfForAuditor(req.user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-report-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Get (compat)' })
  @Get('report-builder/:auditId')
  getReportBuilder(
    @Req() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    return this.svc.getReportForAuditor(req.user, auditId);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Save (compat)' })
  @Put('report-builder/:auditId')
  saveReportBuilder(
    @Req() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
    @Body()
    dto: {
      version?: 'INTERNAL' | 'CLIENT';
      executiveSummary?: string;
      scope?: string;
      methodology?: string;
      findings?: string;
      recommendations?: string;
      selectedObservationIds?: string[];
    },
  ) {
    return this.svc.saveReportDraftForAuditor(req.user, auditId, dto);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Finalize (compat)' })
  @Post('report-builder/:auditId/finalize')
  finalizeReportBuilder(
    @Req() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    return this.svc.finalizeReportForAuditor(req.user, auditId);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Export (compat)' })
  @Get('report-builder/:auditId/export')
  async exportReportBuilder(
    @Req() req: any,
    @Param('auditId', ParseUUIDPipe) auditId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.svc.exportReportPdfForAuditor(req.user, auditId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-report-${auditId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}

@Controller({ path: 'client/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientAuditsController {
  constructor(
    private readonly svc: AuditsService,
    private readonly branchAccess: BranchAccessService,
    private readonly ds: DataSource,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@Req() req: any, @Query() q: any) {
    const rows = await this.svc.listForClient(req.user, q);
    // Branch-scope: filter audits to contractors mapped to user's branches
    const branchIds = await this.branchAccess.getUserBranchIds(req.user.userId);
    if (branchIds.length > 0 && rows.length > 0) {
      // Get contractor IDs mapped to user's branches
      const mapped: { contractor_user_id: string }[] = await this.ds.query(
        `SELECT DISTINCT contractor_user_id FROM branch_contractor WHERE branch_id = ANY($1)`,
        [branchIds],
      );
      const allowedContractors = new Set(
        mapped.map((r) => r.contractor_user_id),
      );
      return rows.filter((a: any) => {
        if (!a.contractorUserId) return true; // non-contractor audits visible to all
        return allowedContractors.has(a.contractorUserId);
      });
    }
    return rows;
  }

  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  summary(@Req() req: any) {
    return this.svc.getSummaryForClient(req.user);
  }
}
