import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { AiRiskEngineService } from './ai-risk-engine.service';
import { AiAuditService } from './ai-audit.service';
import { AiPayrollAnomalyService } from './ai-payroll-anomaly.service';
import { AiCoreService } from './ai-core.service';
import { AiQueryDraftService } from './ai-query-draft.service';
import { AiDocumentCheckService } from './ai-document-check.service';
import { AiRequestLogService } from './ai-request-log.service';
import { AiCostTrackingService } from './ai-cost-tracking.service';
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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('AI')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
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
    private readonly branchAccess: BranchAccessService,
    private readonly costTracking: AiCostTrackingService,
  ) {}

  // ─── Configuration ────────────────────────────────
  @ApiOperation({ summary: 'Get Config' })
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

  @ApiOperation({ summary: 'Update Config' })
  @Put('config')
  @Roles('ADMIN')
  async updateConfig(@Body() dto: UpdateAiConfigDto) {
    return this.aiCore.updateConfig(dto);
  }

  @ApiOperation({ summary: 'Get Status' })
  @Get('status')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getStatus() {
    const ready = await this.aiCore.isReady();
    return {
      aiEnabled: ready,
      message: ready
        ? 'AI is configured and ready'
        : 'AI API key not configured. Fallback mode active with rule-based analysis.',
    };
  }

  // ─── Risk Engine ──────────────────────────────────
  @ApiOperation({ summary: 'Run Risk Assessment' })
  @Post('risk/assess')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async runRiskAssessment(
    @Body() dto: RunRiskAssessmentDto,
    @CurrentUser() user: ReqUser,
  ) {
    try {
      return await this.riskEngine.runAssessment(
        dto.clientId,
        user.userId,
        dto.assessmentType,
      );
    } catch (err) {
      throw new HttpException(
        err?.message || 'Risk assessment failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get Client Risk' })
  @Get('risk/client/:clientId')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async getClientRisk(@Param('clientId') clientId: string) {
    const latest = await this.riskEngine.getLatestAssessment(clientId);
    if (!latest)
      return {
        assessed: false,
        message: 'No risk assessment available. Run one first.',
      };
    return latest;
  }

  @ApiOperation({ summary: 'Get Client Risk History' })
  @Get('risk/client/:clientId/history')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async getClientRiskHistory(
    @Param('clientId') clientId: string,
    @Query('limit') limit?: string,
  ) {
    return this.riskEngine.getAssessmentHistory(clientId, Number(limit) || 10);
  }

  @ApiOperation({ summary: 'Get High Risk Clients' })
  @Get('risk/high-risk')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getHighRiskClients(@Query('limit') limit?: string) {
    return this.riskEngine.getHighRiskClients(Number(limit) || 20);
  }

  @ApiOperation({ summary: 'Get Platform Risk Summary' })
  @Get('risk/summary')
  @Roles('ADMIN', 'CEO', 'CCO')
  async getPlatformRiskSummary() {
    return this.riskEngine.getPlatformRiskSummary();
  }

  // ─── Insights ─────────────────────────────────────
  @ApiOperation({ summary: 'Get Insights' })
  @Get('insights')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async getInsights(
    @Query('clientId') clientId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.riskEngine.getInsights(clientId, Number(limit) || 50);
  }

  @ApiOperation({ summary: 'Dismiss Insight' })
  @Put('insights/:id/dismiss')
  @Roles('ADMIN', 'CEO', 'CCO')
  async dismissInsight(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    await this.riskEngine.dismissInsight(id, user.userId);
    return { success: true };
  }

  // ─── Audit Observations ───────────────────────────
  @ApiOperation({ summary: 'Generate Audit Observation' })
  @Post('audit/generate-observation')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles('AUDITOR')
  async generateAuditObservation(@Body() dto: GenerateAuditObservationDto) {
    try {
      return await this.auditAi.generateObservation(dto);
    } catch (err) {
      throw new HttpException(
        err?.message || 'Observation generation failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'List Observations' })
  @Get('audit/observations')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async listObservations(
    @Query('clientId') clientId?: string,
    @Query('auditId') auditId?: string,
    @Query('status') status?: string,
  ) {
    return this.auditAi.listObservations({ clientId, auditId, status });
  }

  @ApiOperation({ summary: 'Get Observation' })
  @Get('audit/observations/:id')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async getObservation(@Param('id') id: string) {
    return this.auditAi.getObservation(id);
  }

  @ApiOperation({ summary: 'Review Observation' })
  @Put('audit/observations/:id/review')
  @Roles('CCO', 'CRM')
  async reviewObservation(
    @Param('id') id: string,
    @Body() dto: ReviewObservationDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.auditAi.reviewObservation(
      id,
      user.userId,
      dto.status,
      dto.auditorNotes,
    );
  }

  // ─── Payroll Anomaly Detection ────────────────────
  @ApiOperation({ summary: 'Detect Payroll Anomalies' })
  @Post('payroll/detect-anomalies')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles('ADMIN', 'CEO', 'CCO', 'PAYROLL')
  async detectPayrollAnomalies(@Body() dto: DetectPayrollAnomaliesDto) {
    try {
      return await this.payrollAi.detectAnomalies(
        dto.clientId,
        dto.payrollRunId,
      );
    } catch (err) {
      throw new HttpException(
        err?.message || 'Anomaly detection failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'List Anomalies' })
  @Get('payroll/anomalies/:clientId')
  @Roles('ADMIN', 'CEO', 'CCO', 'PAYROLL')
  async listAnomalies(
    @Param('clientId') clientId: string,
    @Query('status') status?: string,
    @Query('type') anomalyType?: string,
  ) {
    return this.payrollAi.listAnomalies(clientId, { status, anomalyType });
  }

  @ApiOperation({ summary: 'Get Anomaly Summary' })
  @Get('payroll/anomaly-summary/:clientId')
  @Roles('ADMIN', 'CEO', 'CCO', 'PAYROLL')
  async getAnomalySummary(@Param('clientId') clientId: string) {
    return this.payrollAi.getAnomalySummary(clientId);
  }

  @ApiOperation({ summary: 'Resolve Anomaly' })
  @Put('payroll/anomalies/:id/resolve')
  @Roles('ADMIN', 'CCO', 'PAYROLL')
  async resolveAnomaly(
    @Param('id') id: string,
    @Body() dto: ResolveAnomalyDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.payrollAi.resolveAnomaly(
      id,
      user.userId,
      dto.status,
      dto.resolutionNotes,
    );
  }

  // ─── AI Dashboard Summary ─────────────────────────
  @ApiOperation({ summary: 'Get Ai Dashboard' })
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
  @ApiOperation({ summary: 'Generate Query Draft' })
  @Post('query-draft')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async generateQueryDraft(
    @Body() dto: QueryDraftDto,
    @CurrentUser() user: ReqUser,
  ) {
    try {
      return await this.queryDraft.draft({
        message: dto.message,
        queryTypeHint: dto.queryTypeHint,
        subject: dto.subject,
        createdBy: user?.userId,
      });
    } catch (err) {
      throw new HttpException(
        err?.message || 'Query draft failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Document Check ───────────────────────────────
  @ApiOperation({ summary: 'Run Document Check' })
  @Post('document-check/:documentId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async runDocumentCheck(
    @Param('documentId') documentId: string,
    @CurrentUser() user: ReqUser,
  ) {
    try {
      return await this.docCheck.checkDocument(documentId, user?.userId);
    } catch (err) {
      throw new HttpException(
        err?.message || 'Document check failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'List Document Checks' })
  @Get('document-checks')
  @Roles('ADMIN', 'CCO', 'CRM', 'AUDITOR')
  async listDocumentChecks(
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('result') result?: string,
    @Query('limit') limit?: string,
  ) {
    return this.docCheck.listChecks({
      clientId,
      branchId,
      result,
      limit: Number(limit) || 50,
    });
  }

  // ─── Branch-Level Risk Assessment ─────────────────
  @ApiOperation({ summary: 'Run Branch Risk Assessment' })
  @Post('risk/branch-assess')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async runBranchRiskAssessment(
    @Body() dto: BranchRiskAssessmentDto,
    @CurrentUser() user: ReqUser,
  ) {
    try {
      return await this.riskEngine.runBranchAssessment({
        branchId: dto.branchId,
        year: dto.year,
        month: dto.month,
        assessedBy: user?.userId,
      });
    } catch (err) {
      throw new HttpException(
        err?.message || 'Branch risk assessment failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get Branch Risk' })
  @Get('risk/branch/:branchId')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT', 'BRANCH', 'AUDITOR')
  async getBranchRisk(
    @CurrentUser() user: ReqUser,
    @Param('branchId') branchId: string,
    @Query('year') yearStr: string,
    @Query('month') monthStr: string,
  ) {
    if (user.roleCode === 'CLIENT' || user.roleCode === 'BRANCH') {
      await this.branchAccess.assertBranchAccess(user.userId, branchId);
    }
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month || month < 1 || month > 12) {
      throw new HttpException('Invalid year/month', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.riskEngine.getBranchRiskSnapshot(branchId, year, month);
    } catch (err) {
      throw new HttpException(
        err?.message || 'Branch risk lookup failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── AI Request Audit Trail ───────────────────────
  @ApiOperation({ summary: 'List Ai Requests' })
  @Get('requests')
  @Roles('ADMIN')
  async listAiRequests(
    @Query('module') module?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.requestLog.listRequests({
      module,
      status,
      limit: Number(limit) || 50,
    });
  }

  @ApiOperation({ summary: 'Get Ai Request' })
  @Get('requests/:id')
  @Roles('ADMIN')
  async getAiRequest(@Param('id') id: string) {
    return this.requestLog.getRequest(id);
  }

  // ─── Cost Tracking ────────────────────────────────
  @ApiOperation({ summary: 'Get Usage Summary' })
  @Get('usage')
  @Roles('ADMIN')
  async getUsageSummary(
    @Query('month') month: string,
    @Query('clientId') clientId?: string,
  ) {
    if (!month) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return this.costTracking.getMonthlySummary(month, clientId);
  }
}
