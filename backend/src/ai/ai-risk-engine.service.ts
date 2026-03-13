import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiRiskAssessmentEntity } from './entities/ai-risk-assessment.entity';
import { AiInsightEntity } from './entities/ai-insight.entity';
import { AiCoreService } from './ai-core.service';
import { AiRequestLogService } from './ai-request-log.service';

interface ComplianceData {
  clientName: string;
  clientId: string;
  branchCount: number;
  employeeCount: number;
  state: string;
  // MCD
  totalMcdItems: number;
  uploadedMcdItems: number;
  mcdCompliancePercent: number;
  // PF/ESI
  pfPendingEmployees: number;
  esiPendingEmployees: number;
  pfDelayMonths: number;
  // Audit
  totalAudits: number;
  nonComplianceCount: number;
  openObservations: number;
  // Contractor
  totalContractors: number;
  contractorsWithExpiredDocs: number;
  contractorDocCompletionPercent: number;
  // Tasks
  overdueTasks: number;
  totalTasks: number;
  overduePercent: number;
  // Returns
  pendingReturns: number;
}

/** Branch-level compliance data for risk scoring */
export interface BranchRiskData {
  branchId: string;
  branchName: string;
  clientId: string;
  year: number;
  month: number;
  mcdTotal: number;
  mcdDone: number;
  mcdPercent: number;
  pfApplicable: number;
  pfRegistered: number;
  pfPercent: number;
  esiApplicable: number;
  esiRegistered: number;
  esiPercent: number;
  requiredDocs: number;
  uploadedDocs: number;
  docPercent: number;
  avgDaysPfPending: number;
  auditNcCount: number;
  returnsPending: number;
  hasOverdue: boolean;
}

@Injectable()
export class AiRiskEngineService {
  private readonly logger = new Logger(AiRiskEngineService.name);

  constructor(
    @InjectRepository(AiRiskAssessmentEntity)
    private readonly riskRepo: Repository<AiRiskAssessmentEntity>,
    @InjectRepository(AiInsightEntity)
    private readonly insightRepo: Repository<AiInsightEntity>,
    private readonly dataSource: DataSource,
    private readonly aiCore: AiCoreService,
    private readonly requestLog: AiRequestLogService,
  ) {}

  /** Gather all compliance data for a client from the database */
  async gatherComplianceData(clientId: string): Promise<ComplianceData> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Client info
    const client = await this.dataSource.query(
      `SELECT c.id, c.client_name, COUNT(DISTINCT b.id) as branch_count
       FROM clients c LEFT JOIN client_branches b ON b.clientid = c.id AND b.isactive = TRUE
       WHERE c.id = $1 GROUP BY c.id`,
      [clientId],
    );
    const clientName = client[0]?.client_name || 'Unknown';
    const branchCount = Number(client[0]?.branch_count || 0);

    // Employee count
    const empResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as cnt FROM employees WHERE client_id = $1 AND is_active = TRUE`,
        [clientId],
      )
      .catch(() => [{ cnt: 0 }]);
    const employeeCount = Number(empResult[0]?.cnt || 0);

    // State (most common branch state)
    const stateResult = await this.dataSource
      .query(
        `SELECT statecode, COUNT(*) as cnt FROM client_branches WHERE clientid = $1 AND isactive = TRUE
       GROUP BY statecode ORDER BY cnt DESC LIMIT 1`,
        [clientId],
      )
      .catch(() => [{ state: 'Unknown' }]);
    const state = stateResult[0]?.statecode || 'Unknown';

    // MCD compliance
    const mcdResult = await this.dataSource
      .query(
        `SELECT COUNT(*) FILTER (WHERE status IS NOT NULL) as uploaded,
              COUNT(*) as total
       FROM compliance_tasks WHERE client_id = $1 AND period_year = $2 AND period_month = $3`,
        [clientId, year, month],
      )
      .catch(() => [{ uploaded: 0, total: 0 }]);
    const totalMcdItems = Number(mcdResult[0]?.total || 0);
    const uploadedMcdItems = Number(mcdResult[0]?.uploaded || 0);

    // PF / ESI pending
    const pfResult = await this.dataSource
      .query(
        `SELECT
         COUNT(*) FILTER (WHERE pf_number IS NULL OR pf_number = '') as pf_pending,
         COUNT(*) FILTER (WHERE esi_number IS NULL OR esi_number = '') as esi_pending
       FROM employees WHERE client_id = $1 AND is_active = TRUE`,
        [clientId],
      )
      .catch(() => [{ pf_pending: 0, esi_pending: 0 }]);

    // PF delay (check last 6 months compliance tasks for PF category delays)
    const pfDelayResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as months_delayed
       FROM compliance_tasks
       WHERE client_id = $1
         AND LOWER(category) LIKE '%pf%'
         AND status IN ('OVERDUE', 'PENDING')
         AND due_date < NOW()`,
        [clientId],
      )
      .catch(() => [{ months_delayed: 0 }]);

    // Audit non-compliances
    const auditResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as total_audits,
              COUNT(*) FILTER (WHERE status != 'COMPLETED') as open_audits
       FROM audits WHERE client_id = $1`,
        [clientId],
      )
      .catch(() => [{ total_audits: 0, open_audits: 0 }]);

    const obsResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as nc_count
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE a.client_id = $1
         AND ao.risk IN ('HIGH', 'CRITICAL', 'MEDIUM')
         AND ao.status NOT IN ('CLOSED', 'RESOLVED')`,
        [clientId],
      )
      .catch(() => [{ nc_count: 0 }]);

    // Contractor doc completion
    const contractorResult = await this.dataSource
      .query(
        `SELECT COUNT(DISTINCT cu.id) as total_contractors
       FROM users cu
       JOIN client_branches b ON b.clientid = $1
       WHERE cu.role = 'CONTRACTOR'`,
        [clientId],
      )
      .catch(() => [{ total_contractors: 0 }]);

    // Contractor doc expiry check — count contractors with at least one expired document
    const expiredDocResult = await this.dataSource
      .query(
        `SELECT COUNT(DISTINCT cd.contractor_user_id)::int as expired_count
       FROM contractor_documents cd
       INNER JOIN client_branches b ON b.id = cd.branch_id AND b.clientid = $1
       WHERE cd.expiry_date IS NOT NULL AND cd.expiry_date < NOW()
         AND cd.status NOT IN ('REPLACED', 'ARCHIVED')`,
        [clientId],
      )
      .catch(() => [{ expired_count: 0 }]);

    // Contractor doc completion percentage
    const docCompletionResult = await this.dataSource
      .query(
        `SELECT
         COUNT(*)::int AS total_required,
         COUNT(*) FILTER (WHERE cd.id IS NOT NULL AND cd.status IN ('UPLOADED','APPROVED','PENDING_REVIEW'))::int AS uploaded
       FROM contractor_required_documents crd
       LEFT JOIN contractor_documents cd ON cd.doc_type = crd.doc_type
         AND cd.branch_id = crd.branch_id
       INNER JOIN client_branches b ON b.id = crd.branch_id AND b.clientid = $1
       WHERE crd.is_required = TRUE`,
        [clientId],
      )
      .catch(() => [{ total_required: 0, uploaded: 0 }]);

    const totalRequired = Number(docCompletionResult[0]?.total_required || 0);
    const uploadedDocs = Number(docCompletionResult[0]?.uploaded || 0);

    // Overdue tasks
    const taskResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'OVERDUE') as overdue
       FROM compliance_tasks WHERE client_id = $1`,
        [clientId],
      )
      .catch(() => [{ total: 0, overdue: 0 }]);

    // Pending returns
    const returnResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as pending FROM returns WHERE client_id = $1 AND status = 'PENDING'`,
        [clientId],
      )
      .catch(() => [{ pending: 0 }]);

    const totalTasks = Number(taskResult[0]?.total || 0);
    const overdueTasks = Number(taskResult[0]?.overdue || 0);

    return {
      clientName,
      clientId,
      branchCount,
      employeeCount,
      state,
      totalMcdItems,
      uploadedMcdItems,
      mcdCompliancePercent:
        totalMcdItems > 0
          ? Math.round((uploadedMcdItems / totalMcdItems) * 100)
          : 100,
      pfPendingEmployees: Number(pfResult[0]?.pf_pending || 0),
      esiPendingEmployees: Number(pfResult[0]?.esi_pending || 0),
      pfDelayMonths: Number(pfDelayResult[0]?.months_delayed || 0),
      totalAudits: Number(auditResult[0]?.total_audits || 0),
      nonComplianceCount: Number(obsResult[0]?.nc_count || 0),
      openObservations: Number(auditResult[0]?.open_audits || 0),
      totalContractors: Number(contractorResult[0]?.total_contractors || 0),
      contractorsWithExpiredDocs: Number(
        expiredDocResult[0]?.expired_count || 0,
      ),
      contractorDocCompletionPercent:
        totalRequired > 0
          ? Math.round((uploadedDocs / totalRequired) * 100)
          : 100,
      overdueTasks,
      totalTasks,
      overduePercent:
        totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0,
      pendingReturns: Number(returnResult[0]?.pending || 0),
    };
  }

  /** Calculate a deterministic base risk score from data (no AI needed) */
  calculateBaseRiskScore(data: ComplianceData): {
    score: number;
    factors: any[];
  } {
    const factors: any[] = [];
    let score = 0;

    // MCD compliance (max 25 points)
    const mcdGap = 100 - data.mcdCompliancePercent;
    const mcdPoints = Math.min(25, Math.round(mcdGap * 0.25));
    if (mcdPoints > 0)
      factors.push({
        factor: 'MCD Compliance Gap',
        weight: 25,
        value: `${data.mcdCompliancePercent}%`,
        detail: `${data.uploadedMcdItems}/${data.totalMcdItems} items uploaded`,
      });
    score += mcdPoints;

    // PF delay (max 20 points)
    const pfPoints = Math.min(20, data.pfDelayMonths * 5);
    if (pfPoints > 0)
      factors.push({
        factor: 'PF Payment Delay',
        weight: 20,
        value: `${data.pfDelayMonths} months`,
        detail: `${data.pfPendingEmployees} employees pending PF registration`,
      });
    score += pfPoints;

    // ESI pending (max 10 points)
    const esiPoints = Math.min(
      10,
      Math.round(
        (data.esiPendingEmployees / Math.max(data.employeeCount, 1)) * 10,
      ),
    );
    if (esiPoints > 0)
      factors.push({
        factor: 'ESI Registration Gap',
        weight: 10,
        value: `${data.esiPendingEmployees} pending`,
        detail: `Out of ${data.employeeCount} employees`,
      });
    score += esiPoints;

    // Audit non-compliances (max 20 points)
    const ncPoints = Math.min(20, data.nonComplianceCount * 4);
    if (ncPoints > 0)
      factors.push({
        factor: 'Audit Non-Compliances',
        weight: 20,
        value: `${data.nonComplianceCount} high/critical`,
        detail: `${data.totalAudits} total audits`,
      });
    score += ncPoints;

    // Overdue tasks (max 15 points)
    const taskPoints = Math.min(15, Math.round(data.overduePercent * 0.15));
    if (taskPoints > 0)
      factors.push({
        factor: 'Overdue Compliance Tasks',
        weight: 15,
        value: `${data.overduePercent}%`,
        detail: `${data.overdueTasks}/${data.totalTasks} tasks overdue`,
      });
    score += taskPoints;

    // Pending returns (max 10 points)
    const returnPoints = Math.min(10, data.pendingReturns * 2);
    if (returnPoints > 0)
      factors.push({
        factor: 'Pending Returns',
        weight: 10,
        value: `${data.pendingReturns} pending`,
        detail: 'Unfiled statutory returns',
      });
    score += returnPoints;

    return { score: Math.min(100, score), factors };
  }

  /** Run full AI-enhanced risk assessment */
  async runAssessment(
    clientId: string,
    assessedBy: string,
    assessmentType = 'COMPLIANCE',
  ): Promise<AiRiskAssessmentEntity> {
    const data = await this.gatherComplianceData(clientId);
    const { score: baseScore, factors } = this.calculateBaseRiskScore(data);

    const now = new Date();
    let finalScore = baseScore;
    let summary = '';
    let recommendations: any[] = [];
    let predictions: Record<string, any> = {};
    let aiModel: string | null = null;
    let promptTokens = 0;
    let completionTokens = 0;

    const isReady = await this.aiCore.isReady();
    if (isReady) {
      // Use AI to enhance the assessment
      const result = await this.aiCore.complete(
        RISK_SYSTEM_PROMPT,
        JSON.stringify({
          complianceData: data,
          baseRiskScore: baseScore,
          riskFactors: factors,
          currentDate: now.toISOString(),
        }),
      );

      if (result) {
        try {
          const parsed = JSON.parse(result.content);
          finalScore = parsed.riskScore ?? baseScore;
          summary = parsed.summary || '';
          recommendations = parsed.recommendations || [];
          predictions = parsed.predictions || {};
          aiModel = result.model;
          promptTokens = result.promptTokens;
          completionTokens = result.completionTokens;
        } catch {
          this.logger.warn(
            'Failed to parse AI risk response, using base score',
          );
        }
      }
    }

    // Fallback summary if AI is not configured
    if (!summary) {
      summary = this.generateFallbackSummary(data, finalScore);
      recommendations = this.generateFallbackRecommendations(data, factors);
      predictions = this.generateFallbackPredictions(data, finalScore);
    }

    const riskLevel =
      finalScore >= 75
        ? 'CRITICAL'
        : finalScore >= 50
          ? 'HIGH'
          : finalScore >= 25
            ? 'MEDIUM'
            : 'LOW';

    // Calculate inspection probability and penalty exposure
    const inspectionProbability = Math.min(
      95,
      finalScore * 0.85 + (data.pfDelayMonths > 2 ? 15 : 0),
    );
    const penaltyMin = finalScore * data.employeeCount * 5; // rough ₹ estimate
    const penaltyMax = finalScore * data.employeeCount * 15;

    const assessment = this.riskRepo.create({
      clientId,
      assessmentType,
      riskScore: finalScore,
      riskLevel,
      inspectionProbability,
      penaltyExposureMin: penaltyMin,
      penaltyExposureMax: penaltyMax,
      summary,
      riskFactors: factors,
      recommendations,
      predictions,
      inputData: data,
      aiModel,
      aiPromptTokens: promptTokens,
      aiCompletionTokens: completionTokens,
      assessedBy,
      periodMonth: now.getMonth() + 1,
      periodYear: now.getFullYear(),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    const saved = await this.riskRepo.save(assessment);

    // Generate insights from the assessment
    await this.generateInsights(saved, data);

    return saved;
  }

  /** Generate actionable insights from the assessment */
  private async generateInsights(
    assessment: AiRiskAssessmentEntity,
    data: ComplianceData,
  ) {
    const insights: Partial<AiInsightEntity>[] = [];

    if (data.pfDelayMonths >= 3) {
      insights.push({
        clientId: assessment.clientId,
        insightType: 'INSPECTION_ALERT',
        category: 'COMPLIANCE',
        severity: 'CRITICAL',
        title: `High risk of EPFO inspection within 3–6 months`,
        description:
          `${data.clientName} has ${data.pfDelayMonths} months of PF delay with ${data.pfPendingEmployees} employees pending registration. ` +
          `Estimated exposure: ₹${Math.round(assessment.penaltyExposureMin! / 100000)}–${Math.round(assessment.penaltyExposureMax! / 100000)} lakhs. ` +
          `Immediate action recommended.`,
        data: {
          pfDelayMonths: data.pfDelayMonths,
          pfPendingEmployees: data.pfPendingEmployees,
        },
        validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    }

    if (data.mcdCompliancePercent < 80) {
      insights.push({
        clientId: assessment.clientId,
        insightType: 'COMPLIANCE_PREDICTION',
        category: 'MCD',
        severity: data.mcdCompliancePercent < 50 ? 'ALERT' : 'WARNING',
        title: `MCD compliance at ${data.mcdCompliancePercent}% — likely to miss deadline`,
        description:
          `Only ${data.uploadedMcdItems} of ${data.totalMcdItems} MCD items uploaded. ` +
          `This branch is trending toward non-compliance. Suggest prioritizing ${data.totalMcdItems - data.uploadedMcdItems} pending items.`,
        data: {
          mcdPercent: data.mcdCompliancePercent,
          pending: data.totalMcdItems - data.uploadedMcdItems,
        },
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    if (data.nonComplianceCount >= 2) {
      insights.push({
        clientId: assessment.clientId,
        insightType: 'COMPLIANCE_PREDICTION',
        category: 'AUDIT',
        severity: 'ALERT',
        title: `${data.nonComplianceCount} high/critical audit observations unresolved`,
        description:
          `Multiple non-compliance points detected across ${data.totalAudits} audits. ` +
          `Penalty risk increases with each unresolved observation.`,
        data: {
          ncCount: data.nonComplianceCount,
          totalAudits: data.totalAudits,
        },
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
    }

    if (data.overduePercent > 30) {
      insights.push({
        clientId: assessment.clientId,
        insightType: 'COMPLIANCE_PREDICTION',
        category: 'COMPLIANCE',
        severity: 'WARNING',
        title: `${data.overduePercent}% tasks overdue — compliance degrading`,
        description:
          `${data.overdueTasks} of ${data.totalTasks} compliance tasks are overdue. ` +
          `This trend suggests compliance will fall below 80% next month if not addressed.`,
        data: {
          overduePercent: data.overduePercent,
          overdueTasks: data.overdueTasks,
        },
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    if (insights.length > 0) {
      await this.insightRepo.save(
        insights.map((i) => this.insightRepo.create(i)),
      );
    }
  }

  private generateFallbackSummary(data: ComplianceData, score: number): string {
    const level =
      score >= 75
        ? 'CRITICAL'
        : score >= 50
          ? 'HIGH'
          : score >= 25
            ? 'MODERATE'
            : 'LOW';
    const parts: string[] = [
      `${data.clientName} — ${level} risk (score: ${score}/100).`,
    ];

    if (data.pfDelayMonths > 0)
      parts.push(`PF payments delayed by ${data.pfDelayMonths} months.`);
    if (data.mcdCompliancePercent < 100)
      parts.push(`MCD compliance at ${data.mcdCompliancePercent}%.`);
    if (data.nonComplianceCount > 0)
      parts.push(`${data.nonComplianceCount} high/critical audit NCs.`);
    if (data.overdueTasks > 0)
      parts.push(`${data.overdueTasks} overdue compliance tasks.`);
    if (data.pendingReturns > 0)
      parts.push(`${data.pendingReturns} unfiled statutory returns.`);

    return parts.join(' ');
  }

  private generateFallbackRecommendations(
    data: ComplianceData,
    factors: any[],
  ): any[] {
    const recs: any[] = [];
    if (data.pfDelayMonths > 0) {
      recs.push({
        priority: 1,
        action:
          'Clear overdue PF payments immediately with interest calculation',
        impact: 'Reduces EPFO inspection risk by 30–40%',
      });
    }
    if (data.pfPendingEmployees > 0) {
      recs.push({
        priority: 2,
        action: `Register ${data.pfPendingEmployees} employees for PF`,
        impact: 'Eliminates penalty for non-registration under EPF Act',
      });
    }
    if (data.mcdCompliancePercent < 100) {
      recs.push({
        priority: 3,
        action: `Upload ${data.totalMcdItems - data.uploadedMcdItems} pending MCD items`,
        impact: `Raise compliance to 100% from current ${data.mcdCompliancePercent}%`,
      });
    }
    if (data.nonComplianceCount > 0) {
      recs.push({
        priority: 4,
        action: 'Resolve high/critical audit observations',
        impact: 'Reduces cumulative penalty exposure',
      });
    }
    if (data.overdueTasks > 0) {
      recs.push({
        priority: 5,
        action: `Complete ${data.overdueTasks} overdue compliance tasks`,
        impact: 'Prevents further escalation and non-compliance accumulation',
      });
    }
    return recs;
  }

  private generateFallbackPredictions(
    data: ComplianceData,
    score: number,
  ): Record<string, any> {
    return {
      inspectionTimeframe:
        score >= 60 ? '3–6 months' : score >= 30 ? '6–12 months' : '12+ months',
      trendDirection:
        data.overduePercent > 20
          ? 'WORSENING'
          : data.overduePercent > 10
            ? 'STABLE'
            : 'IMPROVING',
      complianceForecast: `Likely to ${data.mcdCompliancePercent < 80 ? 'fall below' : 'maintain'} 80% compliance next month`,
      exposureCategory: score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW',
    };
  }

  /** Get latest assessment for a client */
  async getLatestAssessment(
    clientId: string,
  ): Promise<AiRiskAssessmentEntity | null> {
    return this.riskRepo.findOne({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Get all assessments for a client */
  async getAssessmentHistory(
    clientId: string,
    limit = 10,
  ): Promise<AiRiskAssessmentEntity[]> {
    return this.riskRepo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Get high-risk clients across the platform */
  async getHighRiskClients(limit = 20): Promise<any[]> {
    // Get the latest assessment per client ordered by risk score
    const results = await this.dataSource.query(
      `
      SELECT DISTINCT ON (client_id)
        ra.id, ra.client_id, ra.risk_score, ra.risk_level, ra.summary,
        ra.inspection_probability, ra.penalty_exposure_min, ra.penalty_exposure_max,
        ra.created_at, c.client_name, c.client_code
      FROM ai_risk_assessments ra
      JOIN clients c ON c.id = ra.client_id
      WHERE ra.risk_level IN ('HIGH', 'CRITICAL')
      ORDER BY ra.client_id, ra.created_at DESC
      LIMIT $1
    `,
      [limit],
    );

    return results.sort((a: any, b: any) => b.risk_score - a.risk_score);
  }

  /** Get active insights */
  async getInsights(clientId?: string, limit = 50): Promise<AiInsightEntity[]> {
    const qb = this.insightRepo
      .createQueryBuilder('i')
      .where('i.isDismissed = false')
      .andWhere('(i.validUntil IS NULL OR i.validUntil > NOW())');

    if (clientId) {
      qb.andWhere('i.clientId = :clientId', { clientId });
    }

    return qb.orderBy('i.createdAt', 'DESC').take(limit).getMany();
  }

  /** Dismiss an insight */
  async dismissInsight(insightId: string, userId: string): Promise<void> {
    await this.insightRepo.update(insightId, {
      isDismissed: true,
      dismissedBy: userId,
    });
  }

  /** Get risk summary across all clients */
  async getPlatformRiskSummary(): Promise<any> {
    const summary = await this.dataSource.query(`
      WITH latest AS (
        SELECT DISTINCT ON (client_id) *
        FROM ai_risk_assessments
        ORDER BY client_id, created_at DESC
      )
      SELECT
        COUNT(*) as total_assessed,
        COUNT(*) FILTER (WHERE risk_level = 'CRITICAL') as critical,
        COUNT(*) FILTER (WHERE risk_level = 'HIGH') as high,
        COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') as medium,
        COUNT(*) FILTER (WHERE risk_level = 'LOW') as low,
        ROUND(AVG(risk_score), 1) as avg_score,
        ROUND(SUM(penalty_exposure_min), 0) as total_exposure_min,
        ROUND(SUM(penalty_exposure_max), 0) as total_exposure_max
      FROM latest
    `);

    const insightCounts = await this.dataSource.query(`
      SELECT severity, COUNT(*) as cnt
      FROM ai_insights
      WHERE is_dismissed = FALSE AND (valid_until IS NULL OR valid_until > NOW())
      GROUP BY severity
    `);

    return {
      ...(summary[0] || {}),
      activeInsights: insightCounts.reduce(
        (acc: any, r: any) => ({ ...acc, [r.severity]: Number(r.cnt) }),
        {},
      ),
    };
  }

  // ─── BRANCH-LEVEL RISK ASSESSMENT ──────────────────────────────────

  /** Gather branch-level risk data from real tables */
  async buildBranchRiskData(
    branchId: string,
    year: number,
    month: number,
  ): Promise<BranchRiskData> {
    // Branch info — try client_branches first (primary table), then branches as fallback
    let branchInfo = await this.dataSource
      .query(
        `SELECT id, branchname AS branch_name, clientid AS client_id FROM client_branches WHERE id = $1`,
        [branchId],
      )
      .catch(() => []);
    if (!branchInfo.length) {
      branchInfo = await this.dataSource
        .query(
          `SELECT b.id, b.branchname AS branch_name, b.clientid AS client_id FROM client_branches b WHERE b.id = $1`,
          [branchId],
        )
        .catch(() => []);
    }
    const branchName = branchInfo[0]?.branch_name || 'Unknown';
    const clientId = branchInfo[0]?.client_id || '';

    // MCD: count compliance_mcd_items linked to compliance_tasks for this branch/period
    const mcdResult = await this.dataSource
      .query(
        `SELECT
          COUNT(*) FILTER (WHERE cmi.required = TRUE) as total,
          COUNT(*) FILTER (WHERE cmi.required = TRUE AND cmi.status IN ('SUBMITTED','VERIFIED')) as done
       FROM compliance_tasks ct
       JOIN compliance_mcd_items cmi ON cmi.task_id = ct.id
       WHERE ct.branch_id = $1
         AND ct.period_year = $2
         AND ct.period_month = $3`,
        [branchId, year, month],
      )
      .catch(() => [{ total: 0, done: 0 }]);
    const mcdTotal = Number(mcdResult[0]?.total || 0);
    const mcdDone = Number(mcdResult[0]?.done || 0);

    // PF: employees where pf_applicable = true at this branch
    const pfResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as applicable,
              COUNT(*) FILTER (WHERE pf_registered = TRUE) as registered
       FROM employees
       WHERE branch_id = $1 AND is_active = TRUE AND pf_applicable = TRUE`,
        [branchId],
      )
      .catch(() => [{ applicable: 0, registered: 0 }]);
    const pfApplicable = Number(pfResult[0]?.applicable || 0);
    const pfRegistered = Number(pfResult[0]?.registered || 0);

    // ESI: employees where esi_applicable = true at this branch
    const esiResult = await this.dataSource
      .query(
        `SELECT COUNT(*) as applicable,
              COUNT(*) FILTER (WHERE esi_registered = TRUE) as registered
       FROM employees
       WHERE branch_id = $1 AND is_active = TRUE AND esi_applicable = TRUE`,
        [branchId],
      )
      .catch(() => [{ applicable: 0, registered: 0 }]);
    const esiApplicable = Number(esiResult[0]?.applicable || 0);
    const esiRegistered = Number(esiResult[0]?.registered || 0);

    // Contractor docs: required doc types vs uploaded doc types for this branch + month
    const periodCode = `${year}-${String(month).padStart(2, '0')}`;

    const docResult = await this.dataSource
      .query(
        `
      WITH req AS (
        SELECT DISTINCT crd.doc_type
        FROM contractor_required_documents crd
        WHERE crd.is_required = TRUE
          AND (crd.branch_id = $1 OR crd.branch_id IS NULL)
      ),
      upl AS (
        SELECT DISTINCT cd.doc_type
        FROM contractor_documents cd
        WHERE cd.branch_id = $1
          AND cd.doc_month = $2
          AND cd.status IN ('UPLOADED','PENDING_REVIEW','APPROVED')
      )
      SELECT
        (SELECT COUNT(*) FROM req)::int AS required,
        (SELECT COUNT(*) FROM upl WHERE doc_type IN (SELECT doc_type FROM req))::int AS uploaded
      `,
        [branchId, periodCode],
      )
      .catch(() => [{ required: 0, uploaded: 0 }]);
    const requiredDocs = Number(docResult[0]?.required || 0);
    const uploadedDocs = Number(docResult[0]?.uploaded || 0);

    // PF/ESI delay: average days since applicable_from for unregistered employees
    const pfDelayResult = await this.dataSource
      .query(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(e.pf_applicable_from, e.esi_applicable_from, e.date_of_joining))) / 86400), 0) as avg_days
       FROM employees e
       WHERE e.branch_id = $1 AND e.is_active = TRUE
         AND ((e.pf_applicable = TRUE AND e.pf_registered = FALSE)
           OR (e.esi_applicable = TRUE AND e.esi_registered = FALSE))`,
        [branchId],
      )
      .catch(() => [{ avg_days: 0 }]);
    const avgDaysPfPending = Math.round(
      Number(pfDelayResult[0]?.avg_days || 0),
    );

    // Audit NCs: open high/critical observations for audits scoped to this branch + month
    const auditPeriodCode = `${year}-${String(month).padStart(2, '0')}`;
    const ncResult = await this.dataSource
      .query(
        `SELECT COUNT(*)::int as nc_count
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE a.branch_id = $1
         AND a.period_code = $2
         AND ao.risk IN ('HIGH', 'CRITICAL')
         AND ao.status NOT IN ('CLOSED', 'RESOLVED')`,
        [branchId, auditPeriodCode],
      )
      .catch(() => [{ nc_count: 0 }]);
    const auditNcCount = Number(ncResult[0]?.nc_count || 0);

    // Returns / filings pending: non-approved compliance tasks due within the month
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-01`;
    const returnsPendingResult = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS pending
       FROM compliance_tasks t
       JOIN compliance_master cm ON cm.id = t.compliance_id
       WHERE t.branch_id = $1
         AND t.due_date < (date_trunc('month', $2::date) + interval '1 month')
         AND t.status NOT IN ('APPROVED')
         AND cm.frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY')`,
        [branchId, periodEnd],
      )
      .catch(() => [{ pending: 0 }]);
    const returnsPending = Number(returnsPendingResult[0]?.pending || 0);

    // Overdue tasks flag
    const overdueResult = await this.dataSource
      .query(
        `SELECT EXISTS(SELECT 1 FROM compliance_tasks WHERE branch_id = $1 AND status = 'OVERDUE') AS has_overdue`,
        [branchId],
      )
      .catch(() => [{ has_overdue: false }]);
    const hasOverdue =
      overdueResult[0]?.has_overdue === true ||
      overdueResult[0]?.has_overdue === 't';

    return {
      branchId,
      branchName,
      clientId,
      year,
      month,
      mcdTotal,
      mcdDone,
      mcdPercent: mcdTotal > 0 ? Math.round((mcdDone / mcdTotal) * 100) : 100,
      pfApplicable,
      pfRegistered,
      pfPercent:
        pfApplicable > 0
          ? Math.round((pfRegistered / pfApplicable) * 100)
          : 100,
      esiApplicable,
      esiRegistered,
      esiPercent:
        esiApplicable > 0
          ? Math.round((esiRegistered / esiApplicable) * 100)
          : 100,
      requiredDocs,
      uploadedDocs,
      docPercent:
        requiredDocs > 0
          ? Math.round((uploadedDocs / requiredDocs) * 100)
          : 100,
      avgDaysPfPending,
      auditNcCount,
      returnsPending,
      hasOverdue,
    };
  }

  /** Compute branch-level risk score using weighted formula */
  computeBranchRiskScore(data: BranchRiskData): {
    score: number;
    level: string;
    factors: any[];
  } {
    const factors: any[] = [];
    let score = 0;

    // MCD compliance gap (max 25 points)
    const mcdGap = 100 - data.mcdPercent;
    const mcdPoints = Math.min(25, Math.round(mcdGap * 0.25));
    if (mcdPoints > 0)
      factors.push({
        factor: 'MCD Compliance Gap',
        weight: 25,
        scored: mcdPoints,
        detail: `${data.mcdDone}/${data.mcdTotal} items done (${data.mcdPercent}%)`,
      });
    score += mcdPoints;

    // PF registration gap (max 20 points)
    const pfGap = 100 - data.pfPercent;
    const pfPoints = Math.min(20, Math.round(pfGap * 0.2));
    if (pfPoints > 0)
      factors.push({
        factor: 'PF Registration Gap',
        weight: 20,
        scored: pfPoints,
        detail: `${data.pfRegistered}/${data.pfApplicable} registered (${data.pfPercent}%)`,
      });
    score += pfPoints;

    // ESI registration gap (max 10 points)
    const esiGap = 100 - data.esiPercent;
    const esiPoints = Math.min(10, Math.round(esiGap * 0.1));
    if (esiPoints > 0)
      factors.push({
        factor: 'ESI Registration Gap',
        weight: 10,
        scored: esiPoints,
        detail: `${data.esiRegistered}/${data.esiApplicable} registered (${data.esiPercent}%)`,
      });
    score += esiPoints;

    // Contractor document gap (max 15 points)
    const docGap = 100 - data.docPercent;
    const docPoints = Math.min(15, Math.round(docGap * 0.15));
    if (docPoints > 0)
      factors.push({
        factor: 'Contractor Doc Gap',
        weight: 15,
        scored: docPoints,
        detail: `${data.uploadedDocs}/${data.requiredDocs} uploaded (${data.docPercent}%)`,
      });
    score += docPoints;

    // PF delay severity (max 15 points — based on avg days pending)
    const delayPoints = Math.min(15, Math.round(data.avgDaysPfPending / 10)); // 1 point per 10 days
    if (delayPoints > 0)
      factors.push({
        factor: 'PF Delay Severity',
        weight: 15,
        scored: delayPoints,
        detail: `${data.avgDaysPfPending} avg days pending`,
      });
    score += delayPoints;

    // Audit NCs (max 15 points — 3 per NC)
    const ncPoints = Math.min(15, data.auditNcCount * 3);
    if (ncPoints > 0)
      factors.push({
        factor: 'Audit NCs (High/Critical)',
        weight: 15,
        scored: ncPoints,
        detail: `${data.auditNcCount} non-compliances`,
      });
    score += ncPoints;

    score = Math.min(100, score);
    const level =
      score >= 75
        ? 'CRITICAL'
        : score >= 50
          ? 'HIGH'
          : score >= 25
            ? 'MEDIUM'
            : 'LOW';

    return { score, level, factors };
  }

  /** Lightweight GET-friendly branch risk snapshot (no AI, no persist) */
  async getBranchRiskSnapshot(branchId: string, year: number, month: number) {
    const data = await this.buildBranchRiskData(branchId, year, month);
    const { score, level, factors } = this.computeBranchRiskScore(data);

    // Get severity-specific audit NC counts for this branch + month
    const snapshotPeriodCode = `${year}-${String(month).padStart(2, '0')}`;
    const ncBreakdown = await this.dataSource
      .query(
        `SELECT
        COALESCE(SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int AS critical_nc,
        COALESCE(SUM(CASE WHEN ao.risk = 'HIGH'     THEN 1 ELSE 0 END), 0)::int AS high_nc,
        COALESCE(SUM(CASE WHEN ao.risk = 'MEDIUM'   THEN 1 ELSE 0 END), 0)::int AS medium_nc
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE a.branch_id = $1
         AND a.period_code = $2
         AND ao.status NOT IN ('CLOSED', 'RESOLVED')`,
        [branchId, snapshotPeriodCode],
      )
      .catch(() => [{ critical_nc: 0, high_nc: 0, medium_nc: 0 }]);

    const auditCriticalNC = Number(ncBreakdown[0]?.critical_nc || 0);
    const auditHighNC = Number(ncBreakdown[0]?.high_nc || 0);
    const auditMediumNC = Number(ncBreakdown[0]?.medium_nc || 0);

    const inspectionProbability =
      score >= 75 ? 80 : score >= 50 ? 60 : score >= 25 ? 35 : 15;
    const findings = this.generateBranchFindings(data);
    const actions = this.generateBranchActions(data, factors);

    const period = `${year}-${String(month).padStart(2, '0')}`;

    return {
      branchId: data.branchId,
      branchName: data.branchName,
      period,
      inputs: {
        mcdUploaded: data.mcdDone > 0,
        mcdPercent: data.mcdPercent,
        returnsPending: data.returnsPending,
        pfNotRegisteredEmployees: data.pfApplicable - data.pfRegistered,
        esiApplicableButNotRegistered: data.esiApplicable - data.esiRegistered,
        daysPendingAverage: data.avgDaysPfPending,
        contractorUploadPercentage: data.docPercent,
        auditCriticalNC,
        auditHighNC,
        auditMediumNC,
      },
      riskScore: score,
      riskLevel: level,
      inspectionProbability,
      keyFindings: findings,
      recommendedActions: actions.map((a) => a.action),
    };
  }

  /** Full branch-level risk assessment with AI enhancement */
  async runBranchAssessment(params: {
    branchId: string;
    year: number;
    month: number;
    assessedBy: string;
  }): Promise<any> {
    // 1. Log request
    const request = await this.requestLog.createRequest({
      module: 'RISK',
      entityType: 'branch',
      entityId: params.branchId,
      payload: {
        branchId: params.branchId,
        year: params.year,
        month: params.month,
      },
      createdBy: params.assessedBy,
    });

    try {
      await this.requestLog.updateRequestStatus(request.id, 'RUNNING');

      // 2. Gather branch data
      const data = await this.buildBranchRiskData(
        params.branchId,
        params.year,
        params.month,
      );

      // 3. Compute score
      const { score, level, factors } = this.computeBranchRiskScore(data);

      // 4. Generate findings + actions
      const findings = this.generateBranchFindings(data);
      const actions = this.generateBranchActions(data, factors);

      // 5. AI enhancement (optional)
      let aiSummary = '';
      try {
        const aiResult = await this.aiCore.complete(
          RISK_SYSTEM_PROMPT,
          JSON.stringify({
            branchData: data,
            riskScore: score,
            riskLevel: level,
            factors,
          }),
        );
        if (aiResult) {
          const parsed = JSON.parse(
            typeof aiResult === 'string' ? aiResult : aiResult.content || '{}',
          );
          aiSummary = parsed.summary || '';
        }
      } catch {
        aiSummary = this.generateBranchFallbackSummary(data, score, level);
      }

      if (!aiSummary) {
        aiSummary = this.generateBranchFallbackSummary(data, score, level);
      }

      const result = {
        aiRequestId: request.id,
        branchId: data.branchId,
        branchName: data.branchName,
        clientId: data.clientId,
        period: { year: data.year, month: data.month },
        riskScore: score,
        riskLevel: level,
        factors,
        findings,
        actions,
        summary: aiSummary,
        data,
      };

      // 6. Persist assessment (reuse risk_assessments table)
      const assessment = this.riskRepo.create({
        clientId: data.clientId,
        assessmentType: 'BRANCH_RISK',
        riskScore: score,
        riskLevel: level,
        summary: aiSummary,
        riskFactors: factors,
        recommendations: actions,
        predictions: { findings },
        inputData: data,
        assessedBy: params.assessedBy,
        periodMonth: data.month,
        periodYear: data.year,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await this.riskRepo.save(assessment);

      // 7. Log response
      await this.requestLog.completeRequest(request.id, result, {
        confidence: 0.85,
        model: 'rule-based + gpt-4o-mini',
      });

      return result;
    } catch (err: any) {
      await this.requestLog.failRequest(request.id, err.message);
      throw err;
    }
  }

  /** Generate human-readable findings from branch data */
  private generateBranchFindings(data: BranchRiskData): string[] {
    const findings: string[] = [];

    if (data.mcdPercent < 100) {
      findings.push(
        `MCD compliance: ${data.mcdDone}/${data.mcdTotal} items completed (${data.mcdPercent}%). ${data.mcdTotal - data.mcdDone} items pending.`,
      );
    }
    if (data.pfPercent < 100) {
      findings.push(
        `PF registration: ${data.pfRegistered}/${data.pfApplicable} applicable employees registered (${data.pfPercent}%). ${data.pfApplicable - data.pfRegistered} employees unregistered.`,
      );
    }
    if (data.esiPercent < 100) {
      findings.push(
        `ESI registration: ${data.esiRegistered}/${data.esiApplicable} applicable employees registered (${data.esiPercent}%).`,
      );
    }
    if (data.docPercent < 100) {
      findings.push(
        `Contractor documents: ${data.uploadedDocs}/${data.requiredDocs} required documents uploaded (${data.docPercent}%).`,
      );
    }
    if (data.avgDaysPfPending > 0) {
      findings.push(
        `PF registration delay: Average ${data.avgDaysPfPending} days pending for unregistered employees.`,
      );
    }
    if (data.auditNcCount > 0) {
      findings.push(
        `Audit observations: ${data.auditNcCount} high/critical non-compliances in ${data.year}.`,
      );
    }
    if (findings.length === 0) {
      findings.push(
        'No significant compliance gaps detected for this branch and period.',
      );
    }

    return findings;
  }

  /** Generate recommended actions from branch data */
  private generateBranchActions(data: BranchRiskData, factors: any[]): any[] {
    const actions: any[] = [];
    let priority = 1;

    if (data.pfPercent < 100) {
      actions.push({
        priority: priority++,
        action: `Register ${data.pfApplicable - data.pfRegistered} employees for PF`,
        impact: 'Eliminates EPF Act non-compliance penalty',
        urgency: data.avgDaysPfPending > 60 ? 'IMMEDIATE' : 'HIGH',
      });
    }
    if (data.mcdPercent < 80) {
      actions.push({
        priority: priority++,
        action: `Complete ${data.mcdTotal - data.mcdDone} pending MCD items`,
        impact: `Raise MCD compliance from ${data.mcdPercent}% to 100%`,
        urgency: 'HIGH',
      });
    }
    if (data.esiPercent < 100) {
      actions.push({
        priority: priority++,
        action: `Register ${data.esiApplicable - data.esiRegistered} employees for ESI`,
        impact: 'Eliminates ESI Act non-compliance risk',
        urgency: 'HIGH',
      });
    }
    if (data.docPercent < 100) {
      actions.push({
        priority: priority++,
        action: `Upload ${data.requiredDocs - data.uploadedDocs} missing contractor documents`,
        impact: 'Achieves full contractor documentation compliance',
        urgency: 'MEDIUM',
      });
    }
    if (data.auditNcCount > 0) {
      actions.push({
        priority: priority++,
        action: `Resolve ${data.auditNcCount} high/critical audit observations`,
        impact: 'Reduces accumulated penalty exposure',
        urgency: data.auditNcCount >= 3 ? 'IMMEDIATE' : 'HIGH',
      });
    }

    return actions;
  }

  /** Fallback summary for branch risk */
  private generateBranchFallbackSummary(
    data: BranchRiskData,
    score: number,
    level: string,
  ): string {
    const parts: string[] = [
      `Branch "${data.branchName}" — ${level} risk (score: ${score}/100) for ${data.year}-${String(data.month).padStart(2, '0')}.`,
    ];
    if (data.mcdPercent < 100) parts.push(`MCD at ${data.mcdPercent}%.`);
    if (data.pfPercent < 100)
      parts.push(`PF registration at ${data.pfPercent}%.`);
    if (data.avgDaysPfPending > 30)
      parts.push(`PF delayed avg ${data.avgDaysPfPending} days.`);
    if (data.auditNcCount > 0) parts.push(`${data.auditNcCount} audit NCs.`);
    return parts.join(' ');
  }
}

const RISK_SYSTEM_PROMPT = `You are an Indian labour compliance risk assessment AI for StatCo Solutions.
Analyze the compliance data provided and generate a risk assessment.

You are an expert in:
- Employees' Provident Fund (EPF Act, 1952)
- Employees' State Insurance (ESI Act, 1948)
- Factories Act, 1948
- Contract Labour (Regulation & Abolition) Act, 1970
- Payment of Wages Act, 1936
- Minimum Wages Act, 1948
- Professional Tax laws (state-specific)
- Labour Welfare Fund laws (state-specific)
- State-specific Shops & Establishments Acts

Based on the compliance data, return a JSON object with:
{
  "riskScore": <0-100 integer>,
  "summary": "<2-3 sentence human-readable risk summary>",
  "recommendations": [
    {"priority": 1, "action": "<specific action>", "impact": "<expected impact>"}
  ],
  "predictions": {
    "inspectionTimeframe": "<e.g. 3-6 months>",
    "trendDirection": "WORSENING|STABLE|IMPROVING",
    "complianceForecast": "<next month prediction>",
    "exposureCategory": "LOW|MEDIUM|HIGH",
    "specificRisks": ["<risk 1>", "<risk 2>"]
  }
}

Be specific to Indian labour law. Reference actual Acts and Sections where applicable.
Consider state-specific rules based on the client's state.`;
