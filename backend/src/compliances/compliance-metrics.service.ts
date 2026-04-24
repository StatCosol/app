import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  LessThan,
  LessThanOrEqual,
  FindOptionsWhere,
} from 'typeorm';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceDocumentEntity } from '../branch-compliance/entities/compliance-document.entity';
import { SlaTaskEntity } from '../sla/entities/sla-task.entity';
import { BranchRegistrationEntity } from '../branches/entities/branch-registration.entity';
import { SlaComplianceResolverService } from './sla-compliance-resolver.service';
import { SlaComplianceScheduleService } from './sla-compliance-schedule.service';
import { ReqUser } from '../access/access-scope.service';

export interface CompletionRow {
  branchId: string;
  branchName: string;
  stateCode: string | null;
  establishmentType: string | null;
  month: string;
  totalApplicable: number;
  uploaded: number;
  completionPercent: number;
}

export interface RiskScoreRow {
  branchId: string;
  branchName: string;
  stateCode: string | null;
  month: string;
  completionPercent: number;
  overdueSla: number;
  highCritical: number;
  expiringRegistrations: boolean;
  riskScore: number;
  riskLevel: string;
  inspectionProbability: number;
  reasons: string[];
}

export interface CompletionTrendRow {
  month: string;
  completionPercent: number;
  uploaded: number;
  totalApplicable: number;
}

export interface CompletionResult {
  items: CompletionRow[];
}

export interface LowestBranchesResult {
  month: string;
  items: CompletionRow[];
}

export interface CompletionTrendResult {
  branchId: string;
  items: CompletionTrendRow[];
}

export interface RiskScoreResult {
  items: RiskScoreRow[];
}

export interface RiskRankingResult {
  month: string;
  highestRisk: RiskScoreRow[];
  lowestRisk: RiskScoreRow[];
}

export interface RiskHeatmapState {
  stateCode: string;
  LOW: number;
  MODERATE: number;
  HIGH: number;
  CRITICAL: number;
  avgProbability: number;
  count: number;
}

export interface RiskHeatmapResult {
  month: string;
  states: RiskHeatmapState[];
}

export interface ActionPlanItem {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  text: string;
  impact: string;
}

export interface ActionPlanResult {
  branchId: string;
  branchName?: string;
  month: string;
  riskScore: number;
  riskLevel: string;
  inspectionProbability: number;
  actions: ActionPlanItem[];
}

export interface BranchSummaryResult {
  month: string;
  branchId: string;
  summary: string;
  details: RiskScoreRow | null;
}

export interface CompanySummaryResult {
  month: string;
  totalBranches: number;
  avgInspectionProbability: number;
  avgCompletionPercent: number;
  highRiskBranches: number;
  criticalBranches: number;
  highlights: string[];
}

export type SummaryResult = BranchSummaryResult | CompanySummaryResult;

export interface BenchmarkBranchResult {
  branchId: string;
  branchName: string;
  completionPercent: number;
  completionPercentile: number;
  inspectionProbability: number;
  probabilityPercentile: number;
  grade: string;
  riskLevel: string;
}

export interface BenchmarkResult {
  month: string;
  branches: BenchmarkBranchResult[];
}

export interface ExportPackResult {
  generatedAt: string;
  month: string;
  companySummary: CompanySummaryResult;
  riskRanking: RiskRankingResult;
  lowestComplianceBranches: LowestBranchesResult;
  stateHeatmap: RiskHeatmapResult;
  benchmark: BenchmarkResult;
  actionPlans: ActionPlanResult[];
}

@Injectable()
export class ComplianceMetricsService {
  private readonly logger = new Logger(ComplianceMetricsService.name);

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(ComplianceDocumentEntity)
    private readonly _docRepo: Repository<ComplianceDocumentEntity>,
    @InjectRepository(SlaTaskEntity)
    private readonly slaTaskRepo: Repository<SlaTaskEntity>,
    @InjectRepository(BranchRegistrationEntity)
    private readonly regRepo: Repository<BranchRegistrationEntity>,
    private readonly dataSource: DataSource,
    private readonly resolver: SlaComplianceResolverService,
    private readonly schedule: SlaComplianceScheduleService,
  ) {}

  /**
   * Compute upload completion % for one or all branches.
   *
   * Uses the branch-compliance return master + compliance_documents tables
   * to determine how many monthly items have been uploaded vs total applicable.
   */
  async getCompletion(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    branchId?: string;
  }): Promise<CompletionResult> {
    const { clientId, user, month } = params;

    // Determine branch scope
    let branchIds: string[] = [];

    if (params.branchId) {
      branchIds = [params.branchId];
    } else {
      const where: FindOptionsWhere<BranchEntity> = {
        isActive: true,
        isDeleted: false,
      };
      if (clientId) where.clientId = clientId;
      const rows = await this.branchRepo.find({
        where,
        select: ['id'],
      });
      branchIds = rows.map((b) => b.id);
    }

    // Branch user restriction
    const userBranchIds: string[] = user.branchIds ?? [];
    if (userBranchIds.length > 0) {
      branchIds = branchIds.filter((id) => userBranchIds.includes(id));
      if (branchIds.length === 0) {
        return { items: [] };
      }
    }

    // Parse month into year + month number
    const [yearStr, monthStr] = month.split('-');
    const periodYear = Number(yearStr);
    const periodMonth = Number(monthStr);

    const items: CompletionRow[] = [];

    for (const bid of branchIds) {
      try {
        // Fetch branch details
        const branch = await this.branchRepo.findOne({
          where: { id: bid, isActive: true, isDeleted: false },
        });
        if (!branch) continue;

        const branchType = String(branch.branchType || '').toUpperCase();
        const stateCode = branch.stateCode ?? null;

        // Count applicable MONTHLY return master items for this branch type/state
        const excludeAppliesTo = branchType === 'FACTORY' ? 'OFFICE' : 'FACTORY';
        const masterCountResult = await this.dataSource.query(
          `SELECT COUNT(*) AS total
           FROM compliance_return_master
           WHERE is_active = true
             AND frequency = 'MONTHLY'
             AND applies_to != $1
             AND (state_code = 'ALL' OR state_code LIKE '%' || $2 || '%' OR $2 IS NULL)`,
          [excludeAppliesTo, stateCode],
        );
        const total = Number(masterCountResult[0]?.total ?? 0);

        // Count uploaded / submitted documents for this branch + period
        const uploadedResult = await this.dataSource.query(
          `SELECT COUNT(DISTINCT return_code) AS uploaded
           FROM compliance_documents
           WHERE branch_id = $1
             AND period_year = $2
             AND period_month = $3
             AND status NOT IN ('NOT_UPLOADED')`,
          [bid, periodYear, periodMonth],
        );
        const uploaded = Number(uploadedResult[0]?.uploaded ?? 0);

        const pct = total === 0 ? 0 : Math.round((uploaded / total) * 100);

        items.push({
          branchId: bid,
          branchName: branch.branchName || 'Branch',
          stateCode: branch.stateCode ?? null,
          establishmentType: branch.establishmentType ?? null,
          month,
          totalApplicable: total,
          uploaded,
          completionPercent: pct,
        });
      } catch (err: any) {
        this.logger.warn(`Skipping branch ${bid}: ${err?.message}`);
      }
    }

    return { items };
  }

  /**
   * Top N lowest compliance branches for a client.
   */
  async getLowestBranches(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    limit: number;
  }): Promise<LowestBranchesResult> {
    const res = await this.getCompletion({
      clientId: params.clientId,
      user: params.user,
      month: params.month,
    });

    const sorted = (res.items || [])
      .slice()
      .sort((a, b) => a.completionPercent - b.completionPercent);

    return { month: params.month, items: sorted.slice(0, params.limit) };
  }

  /**
   * Month-wise completion trend for a single branch.
   */
  async getCompletionTrend(params: {
    clientId: string;
    user: ReqUser;
    branchId: string;
    months: number;
  }): Promise<CompletionTrendResult> {
    const { clientId, user, branchId, months } = params;

    // Branch user restriction
    const userBranchIds: string[] = user.branchIds ?? [];
    if (userBranchIds.length > 0 && !userBranchIds.includes(branchId)) {
      throw new ForbiddenException('Not allowed for this branch');
    }

    const monthsList = this.lastNMonths(months);
    const items: CompletionTrendRow[] = [];

    for (const m of monthsList) {
      const res = await this.getCompletion({
        clientId,
        user: { ...user, branchIds: [] },
        month: m,
        branchId,
      });
      const row = (res.items || [])[0];
      items.push({
        month: m,
        completionPercent: row?.completionPercent ?? 0,
        uploaded: row?.uploaded ?? 0,
        totalApplicable: row?.totalApplicable ?? 0,
      });
    }

    // Return ascending for chart
    items.sort((a, b) => (a.month < b.month ? -1 : 1));

    return { branchId, items };
  }

  /* ─── Risk Score ──────────────────────── */

  /**
   * Composite "Inspection Exposure Probability" score.
   *
   * Formula:
   *   uploadRisk   = (100 - completionPercent) * 0.40
   *   slaRisk      = min(overdueCount * 5, 30)
   *   criticalRisk = min(highCriticalCount * 4, 20)
   *   regRisk      = hasExpiringRegistration ? 10 : 0
   *   score        = min(100, round(uploadRisk + slaRisk + criticalRisk + regRisk))
   *
   * Returns probability % via logistic curve + human-readable reasons.
   * If branchId omitted → computes for ALL client branches.
   */
  async getRiskScore(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    branchId?: string;
  }): Promise<RiskScoreResult> {
    const { clientId, user, month } = params;

    // Get completion rows (single or multi-branch)
    const comp = await this.getCompletion({
      clientId,
      user: { ...user, branchIds: [] },
      month,
      branchId: params.branchId || undefined,
    });

    const items: RiskScoreRow[] = [];

    for (const row of comp.items) {
      const bid = row.branchId;

      // 1. Upload risk
      const uploadRisk = (100 - row.completionPercent) * 0.4;

      // 2. Overdue SLA tasks
      const overdueCount = await this.getOverdueSlaCount(clientId, bid);
      const slaRisk = Math.min(overdueCount * 5, 30);

      // 3. High / Critical applicable items
      const highCriticalCount = await this.getHighCriticalCount(bid, month);
      const criticalRisk = Math.min(highCriticalCount * 4, 20);

      // 4. Expiring registrations (next 30 days)
      const expiring = await this.hasExpiringRegistration(clientId, bid);
      const regRisk = expiring ? 10 : 0;

      const score = Math.min(
        100,
        Math.round(uploadRisk + slaRisk + criticalRisk + regRisk),
      );
      const probabilityPercent = this.scoreToProbability(score);

      const reasons = this.buildRiskReasons({
        completionPercent: row.completionPercent,
        overdueSla: overdueCount,
        highCritical: highCriticalCount,
        expiringRegistrations: expiring,
      });

      items.push({
        branchId: bid,
        branchName: row.branchName,
        stateCode: row.stateCode,
        month,
        completionPercent: row.completionPercent,
        overdueSla: overdueCount,
        highCritical: highCriticalCount,
        expiringRegistrations: expiring,
        riskScore: score,
        riskLevel: this.riskLevel(score),
        inspectionProbability: probabilityPercent,
        reasons,
      });
    }

    return { items };
  }

  /**
   * Risk ranking — top N highest + lowest risk branches.
   */
  async getRiskRanking(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    limit: number;
  }): Promise<RiskRankingResult> {
    const risk = await this.getRiskScore({
      clientId: params.clientId,
      user: params.user,
      month: params.month,
    });

    const sorted = (risk.items || [])
      .slice()
      .sort((a, b) => b.inspectionProbability - a.inspectionProbability);

    return {
      month: params.month,
      highestRisk: sorted.slice(0, params.limit),
      lowestRisk: sorted.slice(-params.limit).reverse(),
    };
  }

  /**
   * State-wise risk heatmap aggregation.
   */
  async getRiskHeatmap(params: {
    clientId: string;
    user: ReqUser;
    month: string;
  }): Promise<RiskHeatmapResult> {
    const risk = await this.getRiskScore({
      clientId: params.clientId,
      user: params.user,
      month: params.month,
    });

    const bucket = (p: number) =>
      p >= 75 ? 'CRITICAL' : p >= 55 ? 'HIGH' : p >= 35 ? 'MODERATE' : 'LOW';

    const byState: Record<
      string,
      {
        stateCode: string;
        LOW: number;
        MODERATE: number;
        HIGH: number;
        CRITICAL: number;
        avgProbability: number;
        count: number;
      }
    > = {};

    for (const r of risk.items || []) {
      const st = r.stateCode || 'NA';
      if (!byState[st]) {
        byState[st] = {
          stateCode: st,
          LOW: 0,
          MODERATE: 0,
          HIGH: 0,
          CRITICAL: 0,
          avgProbability: 0,
          count: 0,
        };
      }
      byState[st][bucket(r.inspectionProbability)] += 1;
      byState[st].avgProbability += r.inspectionProbability;
      byState[st].count += 1;
    }

    const states = Object.values(byState).map((x) => ({
      ...x,
      avgProbability: x.count ? Math.round(x.avgProbability / x.count) : 0,
    }));

    return { month: params.month, states };
  }

  /** Count open SLA tasks past their due date */
  private async getOverdueSlaCount(
    clientId: string,
    branchId: string,
  ): Promise<number> {
    return this.slaTaskRepo.count({
      where: {
        clientId,
        branchId,
        status: 'OPEN',
        dueDate: LessThan(new Date().toISOString()),
      },
    });
  }

  /** Count HIGH + CRITICAL schedule entries for the branch month */
  private async getHighCriticalCount(
    branchId: string,
    month: string,
  ): Promise<number> {
    try {
      const { branch, applicable } =
        await this.resolver.getApplicableRules(branchId);
      const entries = this.schedule.buildMonthSchedule({
        branch,
        applicable,
        month,
      });
      return entries.filter(
        (e) => e.priority === 'HIGH' || e.priority === 'CRITICAL',
      ).length;
    } catch (e: any) {
      this.logger.warn(
        `getHighCriticalCount failed for branch ${branchId}`,
        (e as Error)?.message,
      );
      return 0;
    }
  }

  /** Any registration expiring within the next 30 days? */
  private async hasExpiringRegistration(
    clientId: string,
    branchId: string,
  ): Promise<boolean> {
    const next30 = new Date();
    next30.setDate(next30.getDate() + 30);

    const cnt = await this.regRepo.count({
      where: {
        clientId,
        branchId,
        expiryDate: LessThanOrEqual(next30),
      },
    });
    return cnt > 0;
  }

  private riskLevel(score: number): string {
    if (score <= 25) return 'LOW';
    if (score <= 50) return 'MODERATE';
    if (score <= 75) return 'HIGH';
    return 'CRITICAL';
  }

  /** Logistic-curve conversion: score 0-100 → probability 1-99% */
  private scoreToProbability(score: number): number {
    const x = (score - 50) / 12;
    const p = 1 / (1 + Math.exp(-x));
    return Math.max(1, Math.min(99, Math.round(p * 100)));
  }

  /** Human-readable risk reasons (max 3) */
  private buildRiskReasons(input: {
    completionPercent: number;
    overdueSla: number;
    highCritical: number;
    expiringRegistrations: boolean;
  }): string[] {
    const out: string[] = [];

    if (input.completionPercent < 60)
      out.push(`Low upload completion (${input.completionPercent}%)`);
    if (input.overdueSla >= 3)
      out.push(`Multiple overdue SLA tasks (${input.overdueSla})`);
    else if (input.overdueSla > 0)
      out.push(`Overdue SLA tasks (${input.overdueSla})`);
    if (input.highCritical > 0)
      out.push(
        `High/Critical compliance items present (${input.highCritical})`,
      );
    if (input.expiringRegistrations)
      out.push('Registration expiry within 30 days');

    if (out.length === 0)
      out.push('Compliance health is stable (no major risk triggers)');

    return out.slice(0, 3);
  }

  private lastNMonths(n: number): string[] {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < n; i++) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      out.push(`${y}-${m}`);
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }

  // ─── Smart Action Plan ──────────────────────────────────────

  /**
   * Generate a prioritised "What To Fix" action plan for a branch.
   * Returns concrete steps ordered by impact on reducing inspection probability.
   */
  async getActionPlan(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    branchId: string;
  }): Promise<ActionPlanResult> {
    const { clientId, user, month, branchId } = params;

    // Get risk data for this branch
    const risk = await this.getRiskScore({ clientId, user, month, branchId });
    const row = (risk.items || [])[0];

    if (!row) {
      return {
        branchId,
        month,
        riskScore: 0,
        riskLevel: 'LOW',
        inspectionProbability: 0,
        actions: [
          {
            priority: 'INFO',
            category: 'GENERAL',
            text: 'No data available for this branch/month.',
            impact: 'N/A',
          },
        ],
      };
    }

    const actions: ActionPlanItem[] = [];

    // ── 1. Upload Completion (40% of risk) ──
    const comp = row.completionPercent ?? 100;
    if (comp < 30) {
      actions.push({
        priority: 'CRITICAL',
        category: 'UPLOADS',
        text: `Upload completion is critically low at ${comp}%. Upload all pending mandatory returns and MCD documents immediately.`,
        impact:
          'Completing uploads to 80%+ can reduce risk score by up to 32 points.',
      });
    } else if (comp < 60) {
      actions.push({
        priority: 'HIGH',
        category: 'UPLOADS',
        text: `Upload completion is ${comp}%. Prioritise uploading pending compliance documents — focus on HIGH priority items first.`,
        impact:
          'Raising completion to 80%+ can reduce risk score by up to 16 points.',
      });
    } else if (comp < 80) {
      actions.push({
        priority: 'MEDIUM',
        category: 'UPLOADS',
        text: `Upload completion is ${comp}%. Complete the remaining ${100 - comp}% of document uploads to strengthen compliance posture.`,
        impact: 'Each 10% improvement reduces risk score by ~4 points.',
      });
    }

    // ── 2. Overdue SLA Tasks (30% of risk) ──
    const overdue = row.overdueSla ?? 0;
    if (overdue >= 6) {
      actions.push({
        priority: 'CRITICAL',
        category: 'SLA',
        text: `${overdue} SLA tasks are past due. Close or resolve the oldest items first — each overdue task adds 5% to your risk exposure (capped at 30%).`,
        impact: `Clearing all overdue tasks removes up to 30 risk points.`,
      });
    } else if (overdue >= 3) {
      actions.push({
        priority: 'HIGH',
        category: 'SLA',
        text: `${overdue} SLA task(s) overdue. Review and close pending SLA items to prevent further risk accumulation.`,
        impact: `Clearing ${overdue} tasks removes ~${Math.min(overdue * 5, 30)} risk points.`,
      });
    } else if (overdue > 0) {
      actions.push({
        priority: 'MEDIUM',
        category: 'SLA',
        text: `${overdue} SLA task(s) overdue. Address remaining items before month-end.`,
        impact: `Clearing removes ~${overdue * 5} risk points.`,
      });
    }

    // ── 3. High/Critical Compliance Items (20% of risk) ──
    const hc = row.highCritical ?? 0;
    if (hc >= 5) {
      actions.push({
        priority: 'HIGH',
        category: 'COMPLIANCE_ITEMS',
        text: `${hc} high/critical compliance items present. Verify filing status of each and upload proof of compliance.`,
        impact: `Addressing all items removes up to 20 risk points.`,
      });
    } else if (hc > 0) {
      actions.push({
        priority: 'MEDIUM',
        category: 'COMPLIANCE_ITEMS',
        text: `${hc} high/critical compliance item(s) detected. Upload supporting documents or mark as filed.`,
        impact: `Each resolved item reduces risk by ~4 points.`,
      });
    }

    // ── 4. Registration Renewals (10% of risk) ──
    if (row.expiringRegistrations) {
      actions.push({
        priority: 'HIGH',
        category: 'REGISTRATIONS',
        text: 'One or more registrations/licenses expire within 30 days. Initiate renewal applications now to avoid lapse.',
        impact: 'Renewing all registrations removes 10 risk points.',
      });
    }

    // ── 5. Positive feedback when risk is low ──
    if (actions.length === 0) {
      actions.push({
        priority: 'INFO',
        category: 'GENERAL',
        text: 'All compliance indicators are healthy. Continue maintaining current upload cadence and SLA response times.',
        impact: 'No corrective action needed.',
      });
    }

    // Sort by priority weight: CRITICAL > HIGH > MEDIUM > LOW > INFO
    const pWeight: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };
    actions.sort(
      (a, b) => (pWeight[a.priority] ?? 9) - (pWeight[b.priority] ?? 9),
    );

    return {
      branchId: row.branchId,
      branchName: row.branchName,
      month,
      riskScore: row.riskScore,
      riskLevel: row.riskLevel,
      inspectionProbability: row.inspectionProbability,
      actions,
    };
  }

  // ─── Next-month Risk Forecast ───────────────────────────────

  /**
   * Predict next month's inspection probability using historical trend,
   * current overdue SLA, upcoming registration expiries, and a
   * simple linear extrapolation of upload completion.
   */
  async getRiskForecast(params: {
    clientId: string;
    user: ReqUser;
    branchId: string;
    monthsHistory: number;
  }) {
    const currentMonth = this.currentMonth();
    const nextMonth = this.shiftMonth(currentMonth, +1);

    // Historical completion trend
    const trend = await this.getCompletionTrend({
      clientId: params.clientId,
      user: params.user,
      branchId: params.branchId,
      months: params.monthsHistory,
    });

    const rows = trend.items || [];
    const avg = rows.length
      ? rows.reduce((s, r) => s + (r.completionPercent || 0), 0) / rows.length
      : 0;
    const last = rows.length ? rows[rows.length - 1].completionPercent : avg;

    // Trend slope (simple linear)
    const slope =
      rows.length >= 2
        ? (last - rows[0].completionPercent) / (rows.length - 1)
        : 0;

    // Forecast completion %
    let forecastCompletion = last + slope;
    forecastCompletion = Math.max(
      0,
      Math.min(100, Math.round(forecastCompletion)),
    );

    // Live risk factors
    const overdueSla = await this.getOverdueSlaCount(
      params.clientId,
      params.branchId,
    );
    const expiring = await this.hasExpiringRegistration(
      params.clientId,
      params.branchId,
    );

    // Risk score components (same weights as getRiskScore)
    const uploadRisk = (100 - forecastCompletion) * 0.4;
    const slaRisk = Math.min(overdueSla * 5, 30);
    const regRisk = expiring ? 10 : 0;

    // Proxy high/critical from completion (simple heuristic)
    const criticalProxy =
      forecastCompletion < 60 ? 2 : forecastCompletion < 80 ? 1 : 0;
    const criticalRisk = criticalProxy * 4;

    let score = uploadRisk + slaRisk + regRisk + criticalRisk;
    score = Math.min(100, Math.round(score));

    const probability = this.scoreToProbability(score);

    return {
      branchId: params.branchId,
      currentMonth,
      nextMonth,
      forecastCompletionPercent: forecastCompletion,
      forecastRiskScore: score,
      forecastInspectionProbability: probability,
      forecastRiskLevel: this.riskLevel(score),
      drivers: {
        trendSlope: Math.round(slope * 10) / 10,
        avgCompletion: Math.round(avg),
        lastCompletion: last,
        overdueSla,
        expiringRegistrations: expiring,
        criticalProxy,
      },
    };
  }

  // ─── AI Compliance Summary ──────────────────────────────────

  /**
   * Generate a human-readable compliance summary.
   * If branchId provided → single branch narrative.
   * If omitted → company-wide executive summary.
   */
  async getSummary(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    branchId?: string;
  }): Promise<SummaryResult> {
    const risk = await this.getRiskScore(params);
    const rows = risk.items || [];

    const makeNarrative = (r: RiskScoreRow) => {
      const reasons = (r.reasons || []).slice(0, 3);
      return [
        `Inspection probability is ${r.inspectionProbability}% (${r.riskLevel}).`,
        `Upload completion is ${r.completionPercent}% with ${r.overdueSla} overdue SLA item(s).`,
        r.expiringRegistrations
          ? 'At least one registration is expiring within 30 days.'
          : 'No registration expiry within 30 days.',
        reasons.length
          ? `Key drivers: ${reasons.join('; ')}.`
          : 'No major risk triggers detected.',
      ].join(' ');
    };

    if (params.branchId) {
      const r = rows[0];
      if (!r) {
        return {
          month: params.month,
          branchId: params.branchId,
          summary: 'No data available for this branch/month.',
          details: null,
        };
      }
      return {
        month: params.month,
        branchId: params.branchId,
        summary: makeNarrative(r),
        details: r,
      };
    }

    // Company-wide summary
    const avgProb = rows.length
      ? Math.round(
          rows.reduce((s, x) => s + x.inspectionProbability, 0) / rows.length,
        )
      : 0;
    const high = rows.filter((x) => x.inspectionProbability >= 70).length;
    const critical = rows.filter((x) => x.inspectionProbability >= 85).length;
    const lowest = rows
      .slice()
      .sort((a, b) => a.completionPercent - b.completionPercent)
      .slice(0, 5);
    const avgCompletion = rows.length
      ? Math.round(
          rows.reduce((s, x) => s + (x.completionPercent || 0), 0) /
            rows.length,
        )
      : 0;

    return {
      month: params.month,
      totalBranches: rows.length,
      avgInspectionProbability: avgProb,
      avgCompletionPercent: avgCompletion,
      highRiskBranches: high,
      criticalBranches: critical,
      highlights: [
        `Average inspection probability across ${rows.length} branches: ${avgProb}%.`,
        `${critical} branch(es) are in CRITICAL zone (≥85%).`,
        `${high} branch(es) are in HIGH zone (≥70%).`,
        `Average upload completion: ${avgCompletion}%.`,
        lowest.length
          ? `Lowest upload completion: ${lowest.map((x) => `${x.branchName} (${x.completionPercent}%)`).join(', ')}.`
          : 'No branch data available.',
      ],
    };
  }

  // ─── Benchmark Score ────────────────────────────────────────

  /**
   * Internal peer benchmark — compares each branch against the
   * client's own average to produce percentile ranks and grades.
   */
  async getBenchmark(params: {
    clientId: string;
    user: ReqUser;
    month: string;
  }): Promise<BenchmarkResult> {
    const risk = await this.getRiskScore(params);
    const rows = risk.items || [];
    const n = rows.length;

    if (n === 0) {
      return { month: params.month, branches: [] };
    }

    // Sorted arrays for percentile calculation
    const completions = rows
      .map((r) => r.completionPercent)
      .sort((a: number, b: number) => a - b);
    const probabilities = rows
      .map((r) => r.inspectionProbability)
      .sort((a: number, b: number) => a - b);

    const percentileOf = (sorted: number[], value: number): number => {
      let below = 0;
      for (const v of sorted) {
        if (v < value) below++;
      }
      return Math.round((below / sorted.length) * 100);
    };

    const grade = (completionPctile: number, riskPctile: number): string => {
      // completionPctile: higher = better upload completion relative to peers
      // riskPctile: higher = higher risk (worse) relative to peers
      // Combine: score = completionPctile - riskPctile (range -100..+100)
      const combined = completionPctile - riskPctile;
      if (combined >= 40) return 'A';
      if (combined >= 10) return 'B';
      if (combined >= -20) return 'C';
      return 'D';
    };

    const branches = rows.map((r) => {
      const compPctile = percentileOf(completions, r.completionPercent);
      const riskPctile = percentileOf(probabilities, r.inspectionProbability);

      return {
        branchId: r.branchId,
        branchName: r.branchName,
        completionPercent: r.completionPercent,
        completionPercentile: compPctile,
        inspectionProbability: r.inspectionProbability,
        probabilityPercentile: riskPctile,
        grade: grade(compPctile, riskPctile),
        riskLevel: r.riskLevel,
      };
    });

    // Sort by grade A→D, then by completion descending
    const gradeOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    branches.sort(
      (a, b) =>
        (gradeOrder[a.grade] ?? 9) - (gradeOrder[b.grade] ?? 9) ||
        b.completionPercent - a.completionPercent,
    );

    return { month: params.month, branches };
  }

  // ─── Inspection Simulation (What-if) ────────────────────────

  /**
   * Simulate risk score changes given hypothetical inputs.
   * Reuses the same scoring formula so results are consistent.
   */
  async simulateRisk(params: {
    clientId: string;
    user: ReqUser;
    month: string;
    branchId: string;
    completionPercent: number;
    overdueSla: number;
    expiringRegistrations: boolean;
    highCritical: number;
  }) {
    // Compute simulated score
    const uploadRisk = (100 - params.completionPercent) * 0.4;
    const slaRisk = Math.min(params.overdueSla * 5, 30);
    const criticalRisk = Math.min(params.highCritical * 4, 20);
    const regRisk = params.expiringRegistrations ? 10 : 0;

    let simScore = uploadRisk + slaRisk + criticalRisk + regRisk;
    simScore = Math.min(100, Math.round(simScore));
    const simProb = this.scoreToProbability(simScore);
    const simLevel = this.riskLevel(simScore);

    // Get current actual values for delta
    const current = await this.getRiskScore({
      clientId: params.clientId,
      user: params.user,
      month: params.month,
      branchId: params.branchId,
    });
    const curRow = (current.items || [])[0];
    const curScore = curRow?.riskScore ?? 0;
    const curProb = curRow?.inspectionProbability ?? 0;

    return {
      branchId: params.branchId,
      month: params.month,
      current: {
        riskScore: curScore,
        inspectionProbability: curProb,
        riskLevel: curRow?.riskLevel ?? 'LOW',
      },
      simulated: {
        riskScore: simScore,
        inspectionProbability: simProb,
        riskLevel: simLevel,
      },
      delta: {
        riskScore: simScore - curScore,
        inspectionProbability: simProb - curProb,
      },
      inputs: {
        completionPercent: params.completionPercent,
        overdueSla: params.overdueSla,
        expiringRegistrations: params.expiringRegistrations,
        highCritical: params.highCritical,
      },
    };
  }

  // ─── Executive Export Pack ──────────────────────────────────

  /**
   * One-call payload that bundles all executive intelligence for
   * PDF/PPT/dashboard export.
   */
  async getExportPack(params: {
    clientId: string;
    user: ReqUser;
    month: string;
  }): Promise<ExportPackResult> {
    const [summary, ranking, lowest, heatmap, benchmark] = await Promise.all([
      this.getSummary({
        clientId: params.clientId,
        user: params.user,
        month: params.month,
      }).then((result) => result as CompanySummaryResult),
      this.getRiskRanking({
        clientId: params.clientId,
        user: params.user,
        month: params.month,
        limit: 10,
      }),
      this.getLowestBranches({
        clientId: params.clientId,
        user: params.user,
        month: params.month,
        limit: 10,
      }),
      this.getRiskHeatmap({
        clientId: params.clientId,
        user: params.user,
        month: params.month,
      }),
      this.getBenchmark({
        clientId: params.clientId,
        user: params.user,
        month: params.month,
      }),
    ]);

    // Action plans for top 10 riskiest branches
    const topRisk = (ranking.highestRisk || []).slice(0, 10);
    const actionPlans: ActionPlanResult[] = [];
    for (const r of topRisk) {
      try {
        const ap = await this.getActionPlan({
          clientId: params.clientId,
          user: params.user,
          month: params.month,
          branchId: r.branchId,
        });
        actionPlans.push(ap);
      } catch (e: any) {
        this.logger.warn(
          `Action plan fetch failed for branch ${r.branchId}`,
          (e as Error)?.message,
        );
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      month: params.month,
      companySummary: summary,
      riskRanking: ranking,
      lowestComplianceBranches: lowest,
      stateHeatmap: heatmap,
      benchmark,
      actionPlans,
    };
  }

  // ─── Utility helpers ────────────────────────────────────────

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private shiftMonth(yyyyMm: string, delta: number): string {
    const [y, m] = yyyyMm.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // ─── XLSX Export Pack builder ───────────────────────────────

  async buildExportPackXlsx(
    data: ExportPackResult,
    month: string,
  ): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'StatComply';
    wb.created = new Date();

    const headerStyle: Partial<import('exceljs').Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' },
      },
      alignment: { horizontal: 'center' },
    };

    // ── Sheet 1: Company Summary ──
    const ws1 = wb.addWorksheet('Summary');
    const summary = data.companySummary;
    ws1.columns = [
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    ws1.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
    const summaryRows: [string, string | number | null | undefined][] = [
      ['Report Month', month],
      ['Generated At', data.generatedAt],
      ['Total Branches', summary.totalBranches],
      [
        'Average Inspection Probability',
        `${summary.avgInspectionProbability}%`,
      ],
      ['Average Completion %', `${summary.avgCompletionPercent}%`],
      ['High Risk Branches', summary.highRiskBranches],
      ['Critical Branches', summary.criticalBranches],
      ['Top Highlight', summary.highlights[0] ?? 'N/A'],
    ];
    for (const [metric, value] of summaryRows) {
      ws1.addRow({ metric, value: value ?? 'N/A' });
    }

    // ── Sheet 2: Risk Ranking ──
    const ws2 = wb.addWorksheet('Risk Ranking');
    const highRisk = data.riskRanking?.highestRisk || [];
    ws2.columns = [
      { header: 'Branch', key: 'branch', width: 30 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Risk Score', key: 'riskScore', width: 15 },
      { header: 'Compliance %', key: 'compliance', width: 15 },
      { header: 'Overdue', key: 'overdue', width: 12 },
      { header: 'Pending', key: 'pending', width: 12 },
    ];
    ws2.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
    for (const r of highRisk) {
      ws2.addRow({
        branch: r.branchName || r.branchId,
        state: r.stateCode || '',
        riskScore: r.riskScore ?? '',
        compliance:
          r.completionPercent != null ? `${r.completionPercent}%` : '',
        overdue: r.overdueSla ?? '',
        pending: r.highCritical ?? '',
      });
    }

    // ── Sheet 3: Lowest Compliance Branches ──
    const ws3 = wb.addWorksheet('Lowest Compliance');
    const lowestArr = data.lowestComplianceBranches.items || [];
    ws3.columns = [
      { header: 'Branch', key: 'branch', width: 30 },
      { header: 'Compliance %', key: 'compliance', width: 15 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Uploaded', key: 'uploaded', width: 12 },
      { header: 'Pending', key: 'pending', width: 12 },
    ];
    ws3.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
    for (const r of lowestArr) {
      ws3.addRow({
        branch: r.branchName || r.branchId || '',
        compliance:
          r.completionPercent != null ? `${r.completionPercent}%` : '',
        total: r.totalApplicable ?? '',
        uploaded: r.uploaded ?? '',
        pending:
          r.totalApplicable != null && r.uploaded != null
            ? r.totalApplicable - r.uploaded
            : '',
      });
    }

    // ── Sheet 4: State Heatmap ──
    const ws4 = wb.addWorksheet('State Heatmap');
    const heatmapArr = data.stateHeatmap.states || [];
    ws4.columns = [
      { header: 'State', key: 'state', width: 20 },
      { header: 'Branches', key: 'branches', width: 12 },
      { header: 'Avg Probability', key: 'probability', width: 15 },
      { header: 'Critical', key: 'critical', width: 12 },
      { header: 'High', key: 'high', width: 12 },
    ];
    ws4.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
    for (const r of heatmapArr) {
      ws4.addRow({
        state: r.stateCode || '',
        branches: r.count ?? '',
        probability: `${r.avgProbability}%`,
        critical: r.CRITICAL ?? 0,
        high: r.HIGH ?? 0,
      });
    }

    // ── Sheet 5: Action Plans ──
    if (data.actionPlans?.length) {
      const ws5 = wb.addWorksheet('Action Plans');
      ws5.columns = [
        { header: 'Branch', key: 'branch', width: 28 },
        { header: 'Item', key: 'item', width: 35 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Due Date', key: 'due', width: 15 },
        { header: 'Priority', key: 'priority', width: 12 },
      ];
      ws5.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
      for (const plan of data.actionPlans) {
        for (const item of plan.actions) {
          ws5.addRow({
            branch: plan.branchName || plan.branchId || '',
            item: item.text || '',
            status: item.category || '',
            due: '',
            priority: item.priority || '',
          });
        }
      }
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
