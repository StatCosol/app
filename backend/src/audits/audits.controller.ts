import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { AuditsService } from './audits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAuditDto } from './dto/create-audit.dto';
import {
  AuditListQueryDto,
  UpdateAuditStatusDto,
  AssignAuditorDto,
  SaveReportDraftDto,
} from './dto/audit-query.dto';
import { OpenAuditWorkspaceDto } from './dto/open-audit-workspace.dto';
import { BranchAccessService } from '../auth/branch-access.service';
import { AuditorAssignmentGuard } from '../assignments/auditor-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

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
    @CurrentUser() user: ReqUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (user.roleCode === 'CLIENT' || user.roleCode === 'BRANCH') {
      await this.branchAccess.assertBranchAccess(user.userId, branchId);
    }
    return this.svc.getBranchAuditKpi(branchId, from, to);
  }

  @ApiOperation({ summary: 'Get Branch Kpi Single' })
  @Get('branch/:branchId/:periodCode')
  async getBranchKpiSingle(
    @CurrentUser() user: ReqUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('periodCode') periodCode: string,
  ) {
    if (user.roleCode === 'CLIENT' || user.roleCode === 'BRANCH') {
      await this.branchAccess.assertBranchAccess(user.userId, branchId);
    }
    return this.svc.getBranchAuditKpiSingle(branchId, periodCode);
  }
}

@Controller({ path: 'crm/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CRM')
export class CrmAuditsController {
  constructor(
    private readonly svc: AuditsService,
    private readonly auditOutputEngine: AuditOutputEngineService,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: AuditListQueryDto) {
    return this.svc.listForCrm(user, q);
  }

  @ApiOperation({ summary: 'CRM Audit Summaries (all assigned clients)' })
  @Get('summaries')
  async getCrmSummaries(@CurrentUser() user: ReqUser) {
    return this.auditOutputEngine.getCrmAuditSummaries(user.userId);
  }

  @ApiOperation({ summary: 'Latest report for an audit' })
  @Get(':id/latest-report')
  async getLatestReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditOutputEngine.getLatestReport(id);
  }

  @ApiOperation({ summary: 'Report version history' })
  @Get(':id/report-history')
  async getReportHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditOutputEngine.getReportHistory(id);
  }

  @ApiOperation({ summary: 'Get One' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForCrm(user, id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(@CurrentUser() user: ReqUser, @Body() dto: CreateAuditDto) {
    return this.svc.createForCrm(user, dto);
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAuditStatusDto,
  ) {
    return this.svc.updateStatus(user, id, dto.status, dto.notes);
  }

  @ApiOperation({ summary: 'Assign Auditor / Reschedule' })
  @Post(':id/assign-auditor')
  assignAuditor(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAuditorDto,
  ) {
    return this.svc.assignAuditorForCrm(user, id, dto);
  }

  @ApiOperation({ summary: 'Readiness Snapshot' })
  @Get(':id/readiness')
  readiness(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getReadinessForCrm(user, id);
  }

  @ApiOperation({ summary: 'Report Status' })
  @Get(':id/report-status')
  reportStatus(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getReportStatusForCrm(user, id);
  }

  @ApiOperation({ summary: 'Approve submitted report (CRM)' })
  @Post(':id/report/approve')
  approveReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { remarks?: string },
  ) {
    return this.svc.approveReportForCrm(user, id, body?.remarks);
  }

  @ApiOperation({ summary: 'Publish approved/submitted report (CRM)' })
  @Post(':id/report/publish')
  publishReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { remarks?: string },
  ) {
    return this.svc.publishReportForCrm(user, id, body?.remarks);
  }

  @ApiOperation({ summary: 'Send report back to draft (CRM)' })
  @Post(':id/report/send-back')
  sendBackReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { remarks: string },
  ) {
    return this.svc.sendBackReportForCrm(user, id, body?.remarks);
  }

  @ApiOperation({ summary: 'Hold report in review queue (CRM)' })
  @Post(':id/report/hold')
  holdReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { remarks?: string },
  ) {
    return this.svc.holdReportForCrm(user, id, body?.remarks);
  }
}

@Controller({ path: 'auditor/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, AuditorAssignmentGuard)
@Roles('AUDITOR')
export class AuditorAuditsController {
  constructor(
    private readonly svc: AuditsService,
    private readonly _ds: DataSource,
    private readonly auditOutputEngine: AuditOutputEngineService,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: AuditListQueryDto) {
    return this.svc.listForAuditor(user, q);
  }

  @ApiOperation({ summary: 'List contractors for a client' })
  @Get('contractors')
  async listContractors(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId: string,
  ) {
    return this.svc.listContractorsForAuditor(user, clientId);
  }

  // ── Dashboard endpoints (static routes — must precede :id) ────
  @ApiOperation({ summary: 'Auditor dashboard summary cards' })
  @Get('dashboard/summary')
  async dashboardSummary(@CurrentUser() user: ReqUser) {
    return this.svc.getAuditorDashboardSummary(user);
  }

  @ApiOperation({ summary: 'Auditor upcoming audits' })
  @Get('dashboard/upcoming')
  async dashboardUpcoming(@CurrentUser() user: ReqUser) {
    return this.svc.getAuditorUpcomingAudits(user);
  }

  @ApiOperation({ summary: 'Auditor recent submitted audits' })
  @Get('dashboard/recent-submitted')
  async dashboardRecentSubmitted(@CurrentUser() user: ReqUser) {
    return this.svc.getAuditorRecentSubmitted(user);
  }

  @ApiOperation({
    summary: 'Auditor dashboard audits table (with progressPct)',
  })
  @Get('dashboard/audits')
  async dashboardAudits(
    @CurrentUser() user: ReqUser,
    @Query('tab') tab: string,
    @Query('clientId') clientId: string,
    @Query('auditType') auditType: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.svc.getDashboardAudits(user, tab || 'ACTIVE', {
      clientId,
      auditType,
      fromDate,
      toDate,
    });
  }

  @ApiOperation({ summary: 'Reverification list (all re-uploaded NCs)' })
  @Get('reverification/list')
  async reverificationList(@CurrentUser() user: ReqUser) {
    return this.svc.getReverificationList(user);
  }

  @ApiOperation({ summary: 'Latest audit report with scores' })
  @Get('reports/:auditId/latest')
  async getLatestReport(@Param('auditId', ParseUUIDPipe) auditId: string) {
    return this.auditOutputEngine.getLatestReport(auditId);
  }

  @ApiOperation({ summary: 'Audit report version history' })
  @Get('reports/:auditId/history')
  async getReportHistory(@Param('auditId', ParseUUIDPipe) auditId: string) {
    return this.auditOutputEngine.getReportHistory(auditId);
  }

  @ApiOperation({ summary: 'Review corrected document' })
  @Post('non-compliances/:ncId/review')
  async reviewCorrectedDoc(
    @CurrentUser() user: ReqUser,
    @Param('ncId', ParseUUIDPipe) ncId: string,
    @Body() body: { decision: 'COMPLIED' | 'NON_COMPLIED'; remark?: string },
  ) {
    return this.svc.reviewCorrectedDocument(
      user,
      ncId,
      body.decision,
      body.remark,
    );
  }

  @ApiOperation({ summary: 'Open audit workspace from schedule' })
  @Post('open-workspace')
  async openWorkspace(
    @CurrentUser() user: ReqUser,
    @Body() dto: OpenAuditWorkspaceDto,
  ) {
    return this.svc.openWorkspaceFromSchedule(dto.scheduleId, user.userId);
  }

  // ── :id parameterized routes ──────────────────────────────────
  @ApiOperation({ summary: 'List contractor documents for an audit' })
  @Get(':id/documents')
  async listAuditDocuments(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.listDocumentsForAudit(user, id);
  }

  @ApiOperation({ summary: 'Review a document (COMPLIED / NON_COMPLIED)' })
  @Post(':id/documents/:docId/review')
  async reviewDocument(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId') docId: string,
    @Body()
    body: {
      decision: 'COMPLIED' | 'NON_COMPLIED';
      remarks?: string;
      sourceTable?: string;
    },
  ) {
    return this.svc.reviewDocumentForAudit(
      user,
      id,
      docId,
      body.decision,
      body.remarks,
      body.sourceTable,
    );
  }

  @ApiOperation({ summary: 'Submit audit (mark complete + calculate score)' })
  @Post(':id/submit')
  async submitAudit(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { finalRemark?: string },
  ) {
    return this.svc.submitAudit(user, id, body?.finalRemark);
  }

  @ApiOperation({ summary: 'Force-complete audit (bypasses pending docs/NCs)' })
  @Post(':id/force-complete')
  async forceCompleteAudit(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { finalRemark?: string },
  ) {
    return this.svc.forceCompleteAudit(user, id, body?.finalRemark);
  }

  @ApiOperation({ summary: 'Set document upload lock window for an audit' })
  @Post(':id/upload-lock')
  async setUploadLock(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { lockFrom?: string | null; lockUntil?: string | null },
  ) {
    return this.svc.setUploadLock(
      user,
      id,
      body?.lockFrom ?? null,
      body?.lockUntil ?? null,
    );
  }

  @ApiOperation({ summary: 'Get document upload lock window for an audit' })
  @Get(':id/upload-lock')
  async getUploadLock(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getUploadLock(user, id);
  }

  @ApiOperation({ summary: 'Re-open audit for re-audit' })
  @Post(':id/reopen')
  async reopenAudit(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.reopenAuditForReaudit(user, id);
  }

  // ── Checklist endpoints ──────────────────────────────────────
  @ApiOperation({ summary: 'Get audit checklist' })
  @Get(':id/checklist')
  async getChecklist(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getChecklist(user, id);
  }

  @ApiOperation({ summary: 'Add checklist item' })
  @Post(':id/checklist')
  async addChecklistItem(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      itemLabel: string;
      docType?: string;
      isRequired?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.svc.addChecklistItem(user, id, body);
  }

  @ApiOperation({ summary: 'Auto-generate checklist from audit type' })
  @Post(':id/checklist/generate')
  async generateChecklist(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.generateChecklistFromCompliance(user, id);
  }

  @ApiOperation({ summary: 'Update checklist item status' })
  @Patch(':id/checklist/:itemId')
  async updateChecklistItem(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body()
    body: {
      status?: string;
      remarks?: string;
      linkedDocId?: string;
      linkedDocTable?: string;
    },
  ) {
    return this.svc.updateChecklistItem(user, id, itemId, body);
  }

  @ApiOperation({ summary: 'Delete checklist item' })
  @Delete(':id/checklist/:itemId')
  async deleteChecklistItem(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.svc.deleteChecklistItem(user, id, itemId);
  }

  @ApiOperation({ summary: 'Get One' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Calculate Score' })
  @Post(':id/score')
  calculateScore(
    @CurrentUser() _user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.calculateScore(id);
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAuditStatusDto,
  ) {
    return this.svc.updateStatus(user, id, dto.status, dto.notes);
  }

  @ApiOperation({ summary: 'Get Report Draft' })
  @Get(':id/report')
  getReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getReportForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Save Report Draft' })
  @Put(':id/report')
  saveReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveReportDraftDto,
  ) {
    return this.svc.saveReportDraftForAuditor(user, id, dto);
  }

  @ApiOperation({ summary: 'Finalize Report Draft' })
  @Post(':id/report/finalize')
  finalizeReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.finalizeReportForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Reopen Report Draft' })
  @Post(':id/report/reopen')
  reopenReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.reopenReportForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Export Final Report Pdf' })
  @Get(':id/report/export')
  async exportReportPdf(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.svc.exportReportPdfForAuditor(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-report-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  // ── NC & audit-specific detail endpoints ───────────────────────
  @ApiOperation({ summary: 'Get non-compliances for an audit' })
  @Get(':id/non-compliances')
  async getNonCompliances(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getNonCompliancesForAudit(user, id);
  }

  @ApiOperation({ summary: 'Get submission history for an audit' })
  @Get(':id/submission-history')
  async getSubmissionHistory(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getSubmissionHistory(user, id);
  }

  @ApiOperation({ summary: 'Get document review history for an audit' })
  @Get(':id/document-reviews')
  async getDocumentReviews(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getDocumentReviews(user, id);
  }

  @ApiOperation({ summary: 'Get audit info' })
  @Get(':id/info')
  async getAuditInfo(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getAuditInfo(user, id);
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
  list(@CurrentUser() user: ReqUser, @Query() q: AuditListQueryDto) {
    return this.svc.listForAuditor(user, q);
  }

  @ApiOperation({ summary: 'Legacy Get One (compat)' })
  @Get(':id')
  getOne(@CurrentUser() user: ReqUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Legacy Update Status (compat)' })
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAuditStatusDto,
  ) {
    return this.svc.updateStatus(user, id, dto.status, dto.notes);
  }

  @ApiOperation({ summary: 'Legacy Report Draft (compat)' })
  @Get(':id/report')
  getReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getReportForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Legacy Save Report Draft (compat)' })
  @Put(':id/report')
  saveReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveReportDraftDto,
  ) {
    return this.svc.saveReportDraftForAuditor(user, id, dto);
  }

  @ApiOperation({ summary: 'Legacy Finalize Report (compat)' })
  @Post(':id/report/finalize')
  finalizeReport(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.finalizeReportForAuditor(user, id);
  }

  @ApiOperation({ summary: 'Legacy Export Report (compat)' })
  @Get(':id/report/export')
  async exportReportPdf(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.svc.exportReportPdfForAuditor(user, id);
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
    @CurrentUser() user: ReqUser,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    return this.svc.getReportForAuditor(user, auditId);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Save (compat)' })
  @Put('report-builder/:auditId')
  saveReportBuilder(
    @CurrentUser() user: ReqUser,
    @Param('auditId', ParseUUIDPipe) auditId: string,
    @Body() dto: SaveReportDraftDto,
  ) {
    return this.svc.saveReportDraftForAuditor(user, auditId, dto);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Finalize (compat)' })
  @Post('report-builder/:auditId/finalize')
  finalizeReportBuilder(
    @CurrentUser() user: ReqUser,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    return this.svc.finalizeReportForAuditor(user, auditId);
  }

  @ApiOperation({ summary: 'Legacy Report Builder Export (compat)' })
  @Get('report-builder/:auditId/export')
  async exportReportBuilder(
    @CurrentUser() user: ReqUser,
    @Param('auditId', ParseUUIDPipe) auditId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.svc.exportReportPdfForAuditor(user, auditId);
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
@Roles('ADMIN', 'CLIENT')
export class ClientAuditsController {
  constructor(
    private readonly svc: AuditsService,
    private readonly branchAccess: BranchAccessService,
    private readonly ds: DataSource,
    private readonly auditOutputEngine: AuditOutputEngineService,
  ) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@CurrentUser() user: ReqUser, @Query() q: AuditListQueryDto) {
    const rows = await this.svc.listForClient(user, q);
    // Branch-scope: filter audits to contractors mapped to user's branches
    const branchIds = await this.branchAccess.getUserBranchIds(user.userId);
    if (branchIds.length > 0 && rows.length > 0) {
      // Get contractor IDs mapped to user's branches
      const mapped: { contractor_user_id: string }[] = await this.ds.query(
        `SELECT DISTINCT contractor_user_id FROM branch_contractor WHERE branch_id = ANY($1)`,
        [branchIds],
      );
      const allowedContractors = new Set(
        mapped.map((r) => r.contractor_user_id),
      );
      return rows.filter((a) => {
        if (!a.contractorUserId) return true; // non-contractor audits visible to all
        return allowedContractors.has(a.contractorUserId);
      });
    }
    return rows;
  }

  @ApiOperation({ summary: 'Summary' })
  @Get('summary')
  summary(@CurrentUser() user: ReqUser) {
    return this.svc.getSummaryForClient(user);
  }

  @ApiOperation({ summary: 'Client Audit Summaries (per branch)' })
  @Get('summaries')
  async getClientSummaries(@CurrentUser() user: ReqUser) {
    return this.auditOutputEngine.getClientAuditSummaries(user.clientId!);
  }

  @ApiOperation({ summary: 'Latest report for an audit' })
  @Get(':id/latest-report')
  async getLatestReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditOutputEngine.getLatestReport(id);
  }
}

@ApiTags('Audits')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @ApiOperation({ summary: 'List contractor audits' })
  @Get()
  async list(@CurrentUser() user: ReqUser, @Query() q: AuditListQueryDto) {
    return this.svc.listForContractor(user, q);
  }

  @ApiOperation({
    summary: 'Get document upload lock window for an audit (contractor view)',
  })
  @Get(':id/upload-lock')
  async getUploadLock(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getUploadLockForContractor(user, id);
  }
}

// ─── Contractor NC endpoints ────────────────────────────────
@ApiTags('Audits')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/audit-non-compliances', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorAuditNcController {
  constructor(private readonly svc: AuditsService) {}

  @ApiOperation({ summary: 'List open non-compliances for contractor' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    return this.svc.getNonCompliancesForContractor(user);
  }

  @ApiOperation({ summary: 'Upload corrected file for an NC' })
  @Post(':ncId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCorrected(
    @CurrentUser() user: ReqUser,
    @Param('ncId', ParseUUIDPipe) ncId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadCorrectedFile(user, ncId, file);
  }
}

// ─── Branch NC endpoints (same flow as contractor) ──────────
@ApiTags('Audits')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/audit-non-compliances', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class BranchAuditNcController {
  constructor(private readonly svc: AuditsService) {}

  @ApiOperation({ summary: 'List open non-compliances for branch user' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    return this.svc.getNonCompliancesForContractor(user);
  }

  @ApiOperation({ summary: 'Upload corrected file for an NC' })
  @Post(':ncId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCorrected(
    @CurrentUser() user: ReqUser,
    @Param('ncId', ParseUUIDPipe) ncId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadCorrectedFile(user, ncId, file);
  }
}
