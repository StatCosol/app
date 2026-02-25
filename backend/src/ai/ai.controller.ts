import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AiRiskEngineService } from './ai-risk-engine.service';
import { AiAuditService } from './ai-audit.service';
import { AiPayrollAnomalyService } from './ai-payroll-anomaly.service';
import { AiCoreService } from './ai-core.service';
import { AiQueryDraftService } from './ai-query-draft.service';
import { AiDocumentCheckService } from './ai-document-check.service';
import { AiRequestLogService } from './ai-request-log.service';
import {
  RunRiskAssessmentDto,
  GenerateAuditObservationDto,
  DetectPayrollAnomaliesDto,
  UpdateAiConfigDto,
  ReviewObservationDto,
  ResolveAnomalyDto,
  QueryDraftDto,
  BranchRiskAssessmentDto,
} from './dto/ai.dto';

@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(
    private readonly riskEngine: AiRiskEngineService,
    private readonly auditAi: AiAuditService,
    private readonly payrollAi: AiPayrollAnomalyService,
    private readonly aiCore: AiCoreService,
    private readonly queryDraft: AiQueryDraftService,
    private readonly docCheck: AiDocumentCheckService,
    private readonly requestLog: AiRequestLogService,
  ) {}

  // ─── Configuration ────────────────────────────────
  @Get('config')
  @Roles('ADMIN')
  async getConfig() {
    const config = await this.aiCore.getConfig();
    if (!config) return { configured: false };
    return {
      configured: !!config.apiKeyEncrypted,
      provider: config.provider,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      isActive: config.isActive,
    };
  }

  @Put('config')
  @Roles('ADMIN')
  async updateConfig(@Body() dto: UpdateAiConfigDto) {
    return this.aiCore.updateConfig(dto);
  }

  @Get('status')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getStatus() {
    const ready = await this.aiCore.isReady();
    return { aiEnabled: ready, message: ready ? 'AI is configured and ready' : 'AI API key not configured. Fallback mode active with rule-based analysis.' };
  }

  // ─── Risk Engine ──────────────────────────────────
  @Post('risk/assess')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async runRiskAssessment(@Body() dto: RunRiskAssessmentDto, @Req() req: any) {
    try {
      return await this.riskEngine.runAssessment(dto.clientId, req.user.userId, dto.assessmentType);
    } catch (err) {
      throw new HttpException(err?.message || 'Risk assessment failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('risk/client/:clientId')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async getClientRisk(@Param('clientId') clientId: string) {
    const latest = await this.riskEngine.getLatestAssessment(clientId);
    if (!latest) return { assessed: false, message: 'No risk assessment available. Run one first.' };
    return latest;
  }

  @Get('risk/client/:clientId/history')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async getClientRiskHistory(@Param('clientId') clientId: string, @Query('limit') limit?: string) {
    return this.riskEngine.getAssessmentHistory(clientId, Number(limit) || 10);
  }

  @Get('risk/high-risk')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getHighRiskClients(@Query('limit') limit?: string) {
    return this.riskEngine.getHighRiskClients(Number(limit) || 20);
  }

  @Get('risk/summary')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getPlatformRiskSummary() {
    return this.riskEngine.getPlatformRiskSummary();
  }

  // ─── Insights ─────────────────────────────────────
  @Get('insights')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async getInsights(@Query('clientId') clientId?: string, @Query('limit') limit?: string) {
    return this.riskEngine.getInsights(clientId, Number(limit) || 50);
  }

  @Put('insights/:id/dismiss')
  @Roles('ADMIN', 'CEO', 'CCO')
  async dismissInsight(@Param('id') id: string, @Req() req: any) {
    await this.riskEngine.dismissInsight(id, req.user.userId);
    return { success: true };
  }

  // ─── Audit Observations ───────────────────────────
  @Post('audit/generate-observation')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async generateAuditObservation(@Body() dto: GenerateAuditObservationDto) {
    try {
      return await this.auditAi.generateObservation(dto);
    } catch (err) {
      throw new HttpException(err?.message || 'Observation generation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('audit/observations')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async listObservations(
    @Query('clientId') clientId?: string,
    @Query('auditId') auditId?: string,
    @Query('status') status?: string,
  ) {
    return this.auditAi.listObservations({ clientId, auditId, status });
  }

  @Get('audit/observations/:id')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async getObservation(@Param('id') id: string) {
    return this.auditAi.getObservation(id);
  }

  @Put('audit/observations/:id/review')
  @Roles('ADMIN', 'CCO', 'AUDITOR')
  async reviewObservation(@Param('id') id: string, @Body() dto: ReviewObservationDto, @Req() req: any) {
    return this.auditAi.reviewObservation(id, req.user.userId, dto.status, dto.auditorNotes);
  }

  // ─── Payroll Anomaly Detection ────────────────────
  @Post('payroll/detect-anomalies')
  @Roles('ADMIN', 'CEO', 'CCO', 'PAYROLL')
  async detectPayrollAnomalies(@Body() dto: DetectPayrollAnomaliesDto) {
    try {
      return await this.payrollAi.detectAnomalies(dto.clientId, dto.payrollRunId);
    } catch (err) {
      throw new HttpException(err?.message || 'Anomaly detection failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('payroll/anomalies/:clientId')
  @Roles('ADMIN', 'CEO', 'CCO', 'PAYROLL')
  async listAnomalies(
    @Param('clientId') clientId: string,
    @Query('status') status?: string,
    @Query('type') anomalyType?: string,
  ) {
    return this.payrollAi.listAnomalies(clientId, { status, anomalyType });
  }

  @Get('payroll/anomaly-summary/:clientId')
  @Roles('ADMIN', 'CEO', 'CCO', 'PAYROLL')
  async getAnomalySummary(@Param('clientId') clientId: string) {
    return this.payrollAi.getAnomalySummary(clientId);
  }

  @Put('payroll/anomalies/:id/resolve')
  @Roles('ADMIN', 'CCO', 'PAYROLL')
  async resolveAnomaly(@Param('id') id: string, @Body() dto: ResolveAnomalyDto, @Req() req: any) {
    return this.payrollAi.resolveAnomaly(id, req.user.userId, dto.status, dto.resolutionNotes);
  }

  // ─── AI Dashboard Summary ─────────────────────────
  @Get('dashboard')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getAiDashboard() {
    const [riskSummary, insights] = await Promise.all([
      this.riskEngine.getPlatformRiskSummary(),
      this.riskEngine.getInsights(undefined, 10),
    ]);
    return {
      riskSummary,
      recentInsights: insights,
    };
  }

  // ─── Query Draft (Auto-Route + Reply) ─────────────
  @Post('query-draft')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async generateQueryDraft(@Body() dto: QueryDraftDto, @Req() req: any) {
    try {
      return await this.queryDraft.draft({
        message: dto.message,
        queryTypeHint: dto.queryTypeHint,
        subject: dto.subject,
        createdBy: req.user?.userId,
      });
    } catch (err) {
      throw new HttpException(err?.message || 'Query draft failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── Document Check ───────────────────────────────
  @Post('document-check/:documentId')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async runDocumentCheck(@Param('documentId') documentId: string, @Req() req: any) {
    try {
      return await this.docCheck.checkDocument(documentId, req.user?.userId);
    } catch (err) {
      throw new HttpException(err?.message || 'Document check failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('document-checks')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async listDocumentChecks(
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('result') result?: string,
    @Query('limit') limit?: string,
  ) {
    return this.docCheck.listChecks({ clientId, branchId, result, limit: Number(limit) || 50 });
  }

  // ─── Branch-Level Risk Assessment ─────────────────
  @Post('risk/branch-assess')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async runBranchRiskAssessment(@Body() dto: BranchRiskAssessmentDto, @Req() req: any) {
    try {
      return await this.riskEngine.runBranchAssessment({
        branchId: dto.branchId,
        year: dto.year,
        month: dto.month,
        assessedBy: req.user?.userId,
      });
    } catch (err) {
      throw new HttpException(err?.message || 'Branch risk assessment failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('risk/branch/:branchId')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT', 'BRANCH', 'AUDITOR')
  async getBranchRisk(
    @Param('branchId') branchId: string,
    @Query('year') yearStr: string,
    @Query('month') monthStr: string,
  ) {
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month || month < 1 || month > 12) {
      throw new HttpException('Invalid year/month', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.riskEngine.getBranchRiskSnapshot(branchId, year, month);
    } catch (err) {
      throw new HttpException(err?.message || 'Branch risk lookup failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── AI Request Audit Trail ───────────────────────
  @Get('requests')
  @Roles('ADMIN')
  async listAiRequests(
    @Query('module') module?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.requestLog.listRequests({ module, status, limit: Number(limit) || 50 });
  }

  @Get('requests/:id')
  @Roles('ADMIN')
  async getAiRequest(@Param('id') id: string) {
    return this.requestLog.getRequest(id);
  }
}
