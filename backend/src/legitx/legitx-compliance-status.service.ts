import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../common/db/db.service';
import {
  ComplianceStatusSummaryResponse,
  BranchComplianceRow,
  ComplianceTaskRow,
  ContractorImpactRow,
  AuditImpactResponse,
  AuditObservationRow,
} from './legitx-compliance-status.types';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface StatusQueryParams {
  month: number;
  year: number;
  branchId?: string | null;
  clientId?: string | null;
  category?: string | null;
  contractorId?: string | null;
  allowedBranchIds?: string[] | 'ALL';
  status?: string | null;
  limit?: number;
  offset?: number;
}

@Injectable()
export class LegitxComplianceStatusService {
  private readonly logger = new Logger(LegitxComplianceStatusService.name);

  constructor(private readonly db: DbService) {}

  // ───────────── Risk calculation ─────────────

  private computeRisk(params: {
    compliancePct: number;
    overdueCritical: number;
    openCriticalObs: number;
    openHighObs: number;
  }): RiskLevel {
    const { compliancePct, overdueCritical, openCriticalObs, openHighObs } = params;
    if (openCriticalObs > 0 || overdueCritical >= 2) return 'CRITICAL';
    if (compliancePct < 70 || openHighObs >= 3) return 'HIGH';
    if (compliancePct >= 70 && compliancePct <= 85) return 'MEDIUM';
    return 'LOW';
  }

  // ───────────── 1. Summary ─────────────

  async getSummary(p: StatusQueryParams): Promise<ComplianceStatusSummaryResponse> {
    const { params, where } = this.buildTaskWhere(p);

    // Task counts
    const taskRow = await this.safeOne<{
      total: number;
      approved: number;
      pending: number;
      overdue: number;
      rejected: number;
      in_review: number;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ct.status = 'APPROVED')::int AS approved,
         COUNT(*) FILTER (WHERE ct.status = 'PENDING')::int AS pending,
         COUNT(*) FILTER (WHERE ct.status = 'OVERDUE' OR (ct.status IN ('PENDING','IN_PROGRESS') AND ct.due_date < CURRENT_DATE))::int AS overdue,
         COUNT(*) FILTER (WHERE ct.status = 'REJECTED')::int AS rejected,
         COUNT(*) FILTER (WHERE ct.status IN ('IN_PROGRESS','SUBMITTED'))::int AS in_review
       FROM compliance_tasks ct
       ${where}`,
      params,
      { total: 0, approved: 0, pending: 0, overdue: 0, rejected: 0, in_review: 0 },
    );

    // Branch count
    const branchCountRow = await this.safeOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT ct.branch_id)::int AS cnt
       FROM compliance_tasks ct
       ${where}`,
      params,
      { cnt: 0 },
    );

    const totalApplicable = taskRow.total;
    const compliancePct = totalApplicable > 0
      ? +((taskRow.approved / totalApplicable) * 100).toFixed(1)
      : 0;

    // Overdue critical: tasks overdue that are important (all overdue for now since we don't have score_weight)
    const overdueCritical = taskRow.overdue;

    // Observation counts
    const obs = await this.getObsCounts(p);

    const riskLevel = this.computeRisk({
      compliancePct,
      overdueCritical: Math.min(overdueCritical, 5), // normalize
      openCriticalObs: obs.critical,
      openHighObs: obs.high,
    });

    return {
      overallCompliancePct: compliancePct,
      totalBranches: branchCountRow.cnt,
      totalApplicable,
      approved: taskRow.approved,
      pending: taskRow.pending,
      overdue: taskRow.overdue,
      rejected: taskRow.rejected,
      inReview: taskRow.in_review,
      criticalNonCompliances: obs.critical,
      riskLevel,
    };
  }

  // ───────────── 2. Branch table ─────────────

  async getBranches(p: StatusQueryParams): Promise<BranchComplianceRow[]> {
    const { params, where } = this.buildTaskWhere(p);

    // Derive branches directly from tasks so even inactive/missing branch rows still appear when tasks exist.
    const rows = await this.safeMany<{
      branch_id: string;
      branch_name: string;
      state_code: string | null;
      establishment_type: string;
      total: number;
      approved: number;
      pending: number;
      overdue: number;
      rejected: number;
    }>(
      `SELECT * FROM (
         SELECT
           COALESCE(cb.id, ct.branch_id, '00000000-0000-0000-0000-000000000000'::uuid) AS branch_id,
           COALESCE(cb.branchname, 'Branch') AS branch_name,
           cb.statecode AS state_code,
           COALESCE(cb.establishment_type, 'Unknown') AS establishment_type,
           COUNT(ct.id)::int AS total,
           COUNT(*) FILTER (WHERE ct.status = 'APPROVED')::int AS approved,
           COUNT(*) FILTER (WHERE ct.status = 'PENDING')::int AS pending,
           COUNT(*) FILTER (WHERE ct.status = 'OVERDUE' OR (ct.status IN ('PENDING','IN_PROGRESS') AND ct.due_date < CURRENT_DATE))::int AS overdue,
           COUNT(*) FILTER (WHERE ct.status = 'REJECTED')::int AS rejected
         FROM compliance_tasks ct
         LEFT JOIN client_branches cb ON cb.id = ct.branch_id AND cb.isdeleted = false
         ${where}
         GROUP BY COALESCE(cb.id, ct.branch_id, '00000000-0000-0000-0000-000000000000'::uuid), cb.branchname, cb.statecode, cb.establishment_type
       ) AS branch_stats
       ORDER BY branch_stats.approved::float / NULLIF(branch_stats.total, 0) ASC NULLS LAST`,
      params,
      [],
    );

    // Get audit scores per branch
    const auditParams: any[] = [p.year];
    let auditWhere = 'WHERE a.period_year = $1';
    if (p.clientId) {
      auditParams.push(p.clientId);
      auditWhere += ` AND a.client_id = $${auditParams.length}`;
    }

    const auditScores = await this.safeMany<{
      client_id: string;
      score: number;
    }>(
      `SELECT a.client_id,
              COALESCE(AVG(a.score_percent), 0)::int AS score
       FROM audits a
       ${auditWhere} AND a.status = 'COMPLETED'
       GROUP BY a.client_id`,
      auditParams,
      [],
    );
    const auditScoreMap = new Map(auditScores.map(a => [a.client_id, a.score]));

    // Get observation counts for risk calc
    const obsRows = await this.getObsCountsByBranch(p);

    const result: BranchComplianceRow[] = rows.map(r => {
      const totalApplicable = r.total;
      const compliancePct = totalApplicable > 0
        ? +((r.approved / totalApplicable) * 100).toFixed(1)
        : 0;

      const branchObs = obsRows.get(r.branch_id) || { high: 0, critical: 0 };

      const riskLevel = this.computeRisk({
        compliancePct,
        overdueCritical: Math.min(r.overdue, 5),
        openCriticalObs: branchObs.critical,
        openHighObs: branchObs.high,
      });

      return {
        branchId: r.branch_id,
        branchName: r.branch_name,
        stateCode: r.state_code,
        establishmentType: r.establishment_type,
        compliancePct,
        approved: r.approved,
        totalApplicable,
        pending: r.pending,
        overdue: r.overdue,
        rejected: r.rejected,
        auditScore: null, // audits are at client level, not branch
        riskLevel,
      };
    });

    // Sort by risk (CRITICAL first) then lowest compliance
    const riskRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    result.sort((a, b) =>
      (riskRank[a.riskLevel] ?? 3) - (riskRank[b.riskLevel] ?? 3) || a.compliancePct - b.compliancePct,
    );

    return result;
  }

  // ───────────── 3. Tasks drill-down ─────────────

  async getTasks(p: StatusQueryParams): Promise<ComplianceTaskRow[]> {
    const { params, where } = this.buildTaskWhere(p);

    // Add category filter
    let extraWhere = '';
    if (p.category) {
      params.push(p.category);
      extraWhere += ` AND UPPER(cm.law_family) = UPPER($${params.length})`;
    }

    // Add status filter (including computed overdue)
    if (p.status) {
      const status = p.status.toUpperCase();
      if (status === 'OVERDUE') {
        extraWhere += ` AND (ct.status = 'OVERDUE' OR (ct.status IN ('PENDING','IN_PROGRESS') AND ct.due_date < CURRENT_DATE))`;
      } else {
        params.push(status);
        extraWhere += ` AND ct.status = $${params.length}`;
      }
    }

    const limit = Number.isFinite(p.limit) ? Math.min(Math.max(p.limit ?? 200, 0), 500) : 200;
    const offset = Number.isFinite(p.offset) ? Math.max(p.offset ?? 0, 0) : 0;
    params.push(limit, offset);

    const rows = await this.safeMany<{
      task_id: number;
      compliance_name: string;
      law_name: string | null;
      frequency: string;
      status: string;
      due_date: string | null;
      branch_id: string | null;
      branch_name: string | null;
      remarks: string | null;
    }>(
      `SELECT
         ct.id AS task_id,
         COALESCE(ct.title, cm.compliance_name, 'Task') AS compliance_name,
         cm.law_name,
         ct.frequency,
         CASE
           WHEN ct.status IN ('PENDING','IN_PROGRESS') AND ct.due_date < CURRENT_DATE THEN 'OVERDUE'
           ELSE ct.status
         END AS status,
         ct.due_date,
         ct.branch_id,
         COALESCE(cb.branchname, 'Branch') AS branch_name,
         ct.remarks
       FROM compliance_tasks ct
       LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
       LEFT JOIN client_branches cb ON cb.id = ct.branch_id AND cb.isdeleted = false
       ${where}${extraWhere}
       ORDER BY
         CASE WHEN ct.status = 'OVERDUE' OR (ct.status IN ('PENDING','IN_PROGRESS') AND ct.due_date < CURRENT_DATE) THEN 0 ELSE 1 END,
         ct.due_date ASC NULLS LAST,
         ct.id DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
      [],
    );

    const today = new Date();

    return rows.map(r => {
      const dueDate = r.due_date ? new Date(r.due_date) : null;
      const delayDays = dueDate && dueDate < today
        ? Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        taskId: r.task_id,
        complianceCode: null,
        title: r.compliance_name,
        lawName: r.law_name,
        frequency: r.frequency,
        status: r.status,
        dueDate: r.due_date,
        delayDays,
        branchId: r.branch_id,
        branchName: r.branch_name,
        remarks: r.remarks,
      };
    });
  }

  // ───────────── 4. Contractor impact ─────────────

  async getContractorImpact(p: StatusQueryParams): Promise<{
    leastCompliant: ContractorImpactRow[];
    mostCompliant: ContractorImpactRow[];
  }> {
    const conditions: string[] = [];
    const qParams: any[] = [];

    if (p.clientId) {
      qParams.push(p.clientId);
      conditions.push(`bc.client_id = $${qParams.length}`);
    }
    if (p.branchId) {
      qParams.push(p.branchId);
      conditions.push(`bc.branch_id = $${qParams.length}`);
    } else if (p.allowedBranchIds && p.allowedBranchIds !== 'ALL') {
      if (p.allowedBranchIds.length === 0) {
        conditions.push('1=0');
      } else {
        qParams.push(p.allowedBranchIds);
        conditions.push(`bc.branch_id = ANY($${qParams.length}::uuid[])`);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.safeMany<{
      contractor_user_id: string;
      contractor_name: string;
      branch_id: string | null;
      branch_name: string | null;
      total_docs: number;
      approved_docs: number;
      pending_docs: number;
      rejected_docs: number;
      expired_docs: number;
    }>(
      `SELECT
         bc.contractor_user_id AS contractor_user_id,
         COALESCE(u.name, u.email, 'Contractor') AS contractor_name,
         bc.branch_id,
         COALESCE(cb.branchname, 'Branch') AS branch_name,
         COALESCE(ds.total_docs, 0)::int AS total_docs,
         COALESCE(ds.approved_docs, 0)::int AS approved_docs,
         COALESCE(ds.pending_docs, 0)::int AS pending_docs,
         COALESCE(ds.rejected_docs, 0)::int AS rejected_docs,
         COALESCE(ds.expired_docs, 0)::int AS expired_docs
       FROM branch_contractor bc
       LEFT JOIN users u ON u.id = bc.contractor_user_id
       LEFT JOIN client_branches cb ON cb.id = bc.branch_id AND cb.isdeleted = false
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS total_docs,
           COUNT(*) FILTER (WHERE cd.status = 'APPROVED')::int AS approved_docs,
           COUNT(*) FILTER (WHERE cd.status IN ('UPLOADED','PENDING_REVIEW'))::int AS pending_docs,
           COUNT(*) FILTER (WHERE cd.status = 'REJECTED')::int AS rejected_docs,
           COUNT(*) FILTER (WHERE cd.status = 'EXPIRED')::int AS expired_docs
         FROM contractor_documents cd
         WHERE cd.contractor_user_id = bc.contractor_user_id
           AND cd.branch_id = bc.branch_id
       ) ds ON true
       ${whereClause}
       ORDER BY contractor_name`,
      qParams,
      [],
    );

    const mapped: ContractorImpactRow[] = rows.map(r => ({
      contractorUserId: r.contractor_user_id,
      contractorName: r.contractor_name,
      branchId: r.branch_id,
      branchName: r.branch_name,
      totalDocuments: r.total_docs,
      approvedDocuments: r.approved_docs,
      pendingDocuments: r.pending_docs,
      rejectedDocuments: r.rejected_docs,
      expiredDocuments: r.expired_docs,
      compliancePct: r.total_docs > 0
        ? +((r.approved_docs / r.total_docs) * 100).toFixed(1)
        : 0,
    }));

    const sorted = [...mapped].sort((a, b) => a.compliancePct - b.compliancePct);

    return {
      leastCompliant: sorted.slice(0, 10),
      mostCompliant: [...sorted].reverse().slice(0, 10),
    };
  }

  // ───────────── 5. Audit impact ─────────────

  async getAuditImpact(p: StatusQueryParams): Promise<AuditImpactResponse> {
    const conditions: string[] = ['a.period_year = $1'];
    const qParams: any[] = [p.year];

    if (p.clientId) {
      qParams.push(p.clientId);
      conditions.push(`a.client_id = $${qParams.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Audit summary
    const auditSummary = await this.safeOne<{
      total: number;
      completed: number;
      avg_score: number;
      last_audit_date: string | null;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
         COALESCE(AVG(a.score_percent) FILTER (WHERE a.status = 'COMPLETED'), 0)::int AS avg_score,
         MAX(a.updated_at)::text AS last_audit_date
       FROM audits a
       ${whereClause}`,
      qParams,
      { total: 0, completed: 0, avg_score: 0, last_audit_date: null },
    );

    // Observation counts
    const obsSummary = await this.safeOne<{
      open_count: number;
      critical_count: number;
      high_count: number;
      reverify_count: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE ao.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))::int AS open_count,
         COUNT(*) FILTER (WHERE ao.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') AND ao.risk = 'CRITICAL')::int AS critical_count,
         COUNT(*) FILTER (WHERE ao.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') AND ao.risk = 'HIGH')::int AS high_count,
         COUNT(*) FILTER (WHERE ao.status = 'REVERIFY')::int AS reverify_count
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       ${whereClause}`,
      qParams,
      { open_count: 0, critical_count: 0, high_count: 0, reverify_count: 0 },
    );

    // Recent observations
    const observations = await this.safeMany<{
      id: string;
      audit_id: string;
      observation: string;
      risk: string | null;
      status: string;
      category_name: string | null;
    }>(
      `SELECT
         ao.id,
         ao.audit_id,
         ao.observation,
         ao.risk,
         ao.status,
         aoc.name AS category_name
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       LEFT JOIN audit_observation_categories aoc ON aoc.id = ao.category_id
       ${whereClause}
       AND ao.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','REVERIFY')
       ORDER BY
         CASE ao.risk WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
         ao.created_at DESC
       LIMIT 50`,
      qParams,
      [],
    );

    return {
      lastAuditDate: auditSummary.last_audit_date,
      overallAuditScore: auditSummary.avg_score,
      totalAudits: auditSummary.total,
      completedAudits: auditSummary.completed,
      openObservations: obsSummary.open_count,
      criticalObservations: obsSummary.critical_count,
      highObservations: obsSummary.high_count,
      reverifyPending: obsSummary.reverify_count,
      observations: observations.map(o => ({
        id: o.id,
        auditId: o.audit_id,
        observation: o.observation,
        risk: o.risk,
        status: o.status,
        category: o.category_name,
      })),
    };
  }

  // ───────────── 6. Returns / Filings status ─────────────

  async getReturnsStatus(p: StatusQueryParams) {
    const conditions: string[] = [
      'r.period_year = $1',
      '(r.period_month IS NULL OR r.period_month = $2)',
    ];
    const qParams: any[] = [p.year, p.month];

    if (p.clientId) {
      qParams.push(p.clientId);
      conditions.push(`r.client_id = $${qParams.length}`);
    }
    if (p.branchId) {
      qParams.push(p.branchId);
      conditions.push(`r.branch_id = $${qParams.length}`);
    } else if (p.allowedBranchIds && p.allowedBranchIds !== 'ALL') {
      if (p.allowedBranchIds.length === 0) {
        conditions.push('1=0');
      } else {
        qParams.push(p.allowedBranchIds);
        conditions.push(`r.branch_id = ANY($${qParams.length}::uuid[])`);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const summary = await this.safeOne<{
      total: number;
      filed: number;
      pending: number;
      overdue: number;
      rejected: number;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE r.filed_date IS NOT NULL)::int AS filed,
         COUNT(*) FILTER (WHERE r.filed_date IS NULL AND r.status NOT IN ('REJECTED'))::int AS pending,
         COUNT(*) FILTER (WHERE r.filed_date IS NULL AND r.due_date < CURRENT_DATE AND r.status NOT IN ('REJECTED'))::int AS overdue,
         COUNT(*) FILTER (WHERE r.status = 'REJECTED')::int AS rejected
       FROM compliance_returns r
       ${whereClause}`,
      qParams,
      { total: 0, filed: 0, pending: 0, overdue: 0, rejected: 0 },
    );

    const rows = await this.safeMany<{
      id: string;
      branch_name: string;
      law_type: string;
      return_type: string;
      period_label: string | null;
      due_date: string | null;
      status: string;
      filed_date: string | null;
      delay_days: number;
    }>(
      `SELECT
         r.id,
         COALESCE(cb.branchname, 'Branch') AS branch_name,
         r.law_type,
         r.return_type,
         r.period_label,
         r.due_date,
         CASE
           WHEN r.filed_date IS NOT NULL THEN 'FILED'
           WHEN r.status = 'REJECTED' THEN 'REJECTED'
           WHEN r.due_date < CURRENT_DATE THEN 'OVERDUE'
           WHEN r.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_SOON'
           ELSE 'PENDING'
         END AS status,
         r.filed_date,
         CASE
           WHEN r.filed_date IS NULL AND r.due_date < CURRENT_DATE
             THEN EXTRACT(DAY FROM CURRENT_DATE - r.due_date::timestamp)::int
           ELSE 0
         END AS delay_days
       FROM compliance_returns r
       LEFT JOIN client_branches cb ON cb.id = r.branch_id AND cb.isdeleted = false
       ${whereClause}
       ORDER BY
         CASE
           WHEN r.filed_date IS NULL AND r.due_date < CURRENT_DATE THEN 0
           WHEN r.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1
           ELSE 2
         END,
         r.due_date ASC NULLS LAST`,
      qParams,
      [],
    );

    return { summary, data: rows };
  }

  // ───────────── Helpers ─────────────

  private buildTaskWhere(p: StatusQueryParams): { params: any[]; where: string } {
    const conditions: string[] = [
      'ct.period_year = $1',
      '(ct.period_month IS NULL OR ct.period_month = $2)',
    ];
    const params: any[] = [p.year, p.month];

    if (p.clientId) {
      params.push(p.clientId);
      conditions.push(`ct.client_id = $${params.length}`);
    }
    if (p.branchId) {
      params.push(p.branchId);
      conditions.push(`ct.branch_id = $${params.length}`);
    } else if (p.allowedBranchIds && p.allowedBranchIds !== 'ALL') {
      if (p.allowedBranchIds.length === 0) {
        conditions.push('1=0');
      } else {
        params.push(p.allowedBranchIds);
        conditions.push(`ct.branch_id = ANY($${params.length}::uuid[])`);
      }
    }

    return {
      params,
      where: `WHERE ${conditions.join(' AND ')}`,
    };
  }

  private async getObsCounts(p: StatusQueryParams): Promise<{ high: number; critical: number }> {
    const conditions: string[] = ['a.period_year = $1'];
    const qParams: any[] = [p.year];

    if (p.clientId) {
      qParams.push(p.clientId);
      conditions.push(`a.client_id = $${qParams.length}`);
    }

    const row = await this.safeOne<{ high: number; critical: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE ao.risk = 'HIGH' AND ao.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))::int AS high,
         COUNT(*) FILTER (WHERE ao.risk = 'CRITICAL' AND ao.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))::int AS critical
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE ${conditions.join(' AND ')}`,
      qParams,
      { high: 0, critical: 0 },
    );

    return row;
  }

  private async getObsCountsByBranch(p: StatusQueryParams): Promise<Map<string, { high: number; critical: number }>> {
    // Since audits are at client level (no branch_id), we return empty map
    // When audits get branch_id, this can be enhanced
    return new Map();
  }

  private async safeOne<T>(sql: string, params: any[], fallback: T): Promise<T> {
    try {
      const row = await this.db.one<T>(sql, params);
      return (row as T) ?? fallback;
    } catch (err: any) {
      this.logger.debug(`SQL one failed: ${err?.message ?? err}`);
      return fallback;
    }
  }

  private async safeMany<T>(sql: string, params: any[], fallback: T[]): Promise<T[]> {
    try {
      return (await this.db.many<T>(sql, params)) ?? fallback;
    } catch (err: any) {
      this.logger.debug(`SQL many failed: ${err?.message ?? err}`);
      return fallback;
    }
  }
}
