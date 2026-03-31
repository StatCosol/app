import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * CEO Dashboard Service
 * Provides executive-level KPIs and governance metrics
 * Uses raw SQL queries for complex aggregations
 */
@Injectable()
export class CeoDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveMonthParts(month?: string): {
    year: number | null;
    month: number | null;
  } {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { year: null, month: null };
    }
    const [y, m] = month.split('-').map((v) => Number(v));
    if (!y || !m || m < 1 || m > 12) {
      return { year: null, month: null };
    }
    return { year: y, month: m };
  }

  private resolveMonthBounds(month?: string): {
    startDate: string | null;
    endDate: string | null;
  } {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { startDate: null, endDate: null };
    }

    const start = new Date(`${month}-01T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      return { startDate: null, endDate: null };
    }

    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  /**
   * CEO branch workspace list.
   * Aggregates branch-level compliance, overdue, audit score, and risk.
   */
  async getBranchWorkspaceList(query: { month?: string; state?: string; client?: string; q?: string; riskBand?: string }) {
    const { year, month } = this.resolveMonthParts(query?.month);
    const { startDate, endDate } = this.resolveMonthBounds(query?.month);

    const state = query?.state ? String(query.state).trim() : null;
    const client = query?.client ? `%${String(query.client).trim()}%` : null;
    const q = query?.q ? `%${String(query.q).trim()}%` : null;
    const riskBand = query?.riskBand
      ? String(query.riskBand).trim().toUpperCase()
      : null;

    const rows = await this.dataSource.query(
      `
      WITH monthly_tasks AS (
        SELECT
          ct.branch_id,
          COUNT(*)::int AS total_tasks,
          COUNT(CASE WHEN ct.status = 'APPROVED' THEN 1 END)::int AS approved_tasks,
          COUNT(CASE WHEN ct.status = 'OVERDUE' THEN 1 END)::int AS overdue_tasks
        FROM compliance_tasks ct
        WHERE ($1::int IS NULL OR ct.period_year = $1)
          AND ($2::int IS NULL OR ct.period_month = $2)
        GROUP BY ct.branch_id
      ),
      audit_scores AS (
        SELECT
          a.branch_id,
          ROUND(AVG(a.score)::numeric, 1) AS avg_audit_score
        FROM audits a
        WHERE ($3::date IS NULL OR COALESCE(a.due_date::date, a.created_at::date) >= $3::date)
          AND ($4::date IS NULL OR COALESCE(a.due_date::date, a.created_at::date) < $4::date)
        GROUP BY a.branch_id
      ),
      branch_rows AS (
        SELECT
          b.id AS "branchId",
          b.branchname AS "branchName",
          c.client_name AS "clientName",
          COALESCE(b.statecode, '-') AS state,
          CASE
            WHEN COALESCE(mt.total_tasks, 0) > 0
              THEN ROUND((mt.approved_tasks::numeric / mt.total_tasks) * 100, 1)
            ELSE 0
          END AS "compliancePercent",
          COALESCE(mt.overdue_tasks, 0)::int AS "overdueCount",
          COALESCE(a.avg_audit_score, 0)::numeric AS "auditScore",
          CASE
            WHEN COALESCE(mt.total_tasks, 0) > 0
              THEN ROUND((mt.overdue_tasks::numeric / mt.total_tasks) * 100, 1)
            ELSE 0
          END AS "riskExposureScore"
        FROM client_branches b
        INNER JOIN clients c ON c.id = b.clientid
        LEFT JOIN monthly_tasks mt ON mt.branch_id = b.id
        LEFT JOIN audit_scores a ON a.branch_id = b.id
        WHERE b.isactive = true
          AND b.isdeleted = false
          AND (c.is_deleted = false OR c.is_deleted IS NULL)
          AND ($5::text IS NULL OR b.statecode = $5)
          AND ($6::text IS NULL OR c.client_name ILIKE $6)
          AND (
            $7::text IS NULL
            OR b.branchname ILIKE $7
            OR c.client_name ILIKE $7
            OR COALESCE(b.statecode, '') ILIKE $7
          )
      )
      SELECT *
      FROM branch_rows br
      WHERE (
        $8::text IS NULL
        OR ($8 = 'HIGH' AND br."riskExposureScore" >= 75)
        OR ($8 = 'MEDIUM' AND br."riskExposureScore" >= 40 AND br."riskExposureScore" < 75)
        OR ($8 = 'LOW' AND br."riskExposureScore" < 40)
      )
      ORDER BY br."riskExposureScore" DESC, br."overdueCount" DESC, br."branchName" ASC
      `,
      [year, month, startDate, endDate, state, client, q, riskBand],
    );

    return {
      items: rows || [],
      total: (rows || []).length,
      month: query?.month || null,
    };
  }

  /**
   * CEO branch workspace detail.
   * Returns compliance, audit, payroll, contractor, and alert drill-down metrics.
   */
  async getBranchWorkspaceDetail(branchId: string, query: { month?: string }) {
    const { year, month } = this.resolveMonthParts(query?.month);
    const { startDate, endDate } = this.resolveMonthBounds(query?.month);

    const [branch] = await this.dataSource.query(
      `
      SELECT
        b.id AS "branchId",
        b.branchname AS "branchName",
        c.id AS "clientId",
        c.client_name AS "clientName",
        COALESCE(b.statecode, '-') AS state
      FROM client_branches b
      INNER JOIN clients c ON c.id = b.clientid
      WHERE b.id = $1
        AND b.isdeleted = false
        AND (c.is_deleted = false OR c.is_deleted IS NULL)
      LIMIT 1
      `,
      [branchId],
    );

    if (!branch) return null;

    const [taskSummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(CASE WHEN ct.status = 'APPROVED' THEN 1 END)::int AS approved,
        COUNT(CASE WHEN ct.status = 'OVERDUE' THEN 1 END)::int AS overdue,
        COUNT(CASE WHEN ct.status IN ('PENDING', 'IN_PROGRESS') THEN 1 END)::int AS due_soon,
        COUNT(CASE WHEN ct.frequency = 'MONTHLY' THEN 1 END)::int AS monthly_total,
        COUNT(CASE WHEN ct.frequency = 'MONTHLY' AND ct.status = 'APPROVED' THEN 1 END)::int AS monthly_approved,
        COUNT(CASE WHEN ct.frequency <> 'MONTHLY' THEN 1 END)::int AS returns_total,
        COUNT(CASE WHEN ct.frequency <> 'MONTHLY' AND ct.status = 'APPROVED' THEN 1 END)::int AS returns_approved
      FROM compliance_tasks ct
      WHERE ct.branch_id = $1
        AND ($2::int IS NULL OR ct.period_year = $2)
        AND ($3::int IS NULL OR ct.period_month = $3)
      `,
      [branchId, year, month],
    );

    const [auditSummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total_audits,
        COUNT(CASE WHEN a.status = 'PLANNED' THEN 1 END)::int AS planned_audits,
        COUNT(CASE WHEN a.status = 'IN_PROGRESS' THEN 1 END)::int AS ongoing_audits,
        COUNT(CASE WHEN a.status = 'COMPLETED' THEN 1 END)::int AS completed_audits,
        ROUND(AVG(a.score)::numeric, 1) AS avg_audit_score
      FROM audits a
      WHERE a.branch_id = $1
        AND ($2::date IS NULL OR COALESCE(a.due_date::date, a.created_at::date) >= $2::date)
        AND ($3::date IS NULL OR COALESCE(a.due_date::date, a.created_at::date) < $3::date)
      `,
      [branchId, startDate, endDate],
    );

    const [observationSummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS open_observations,
        COUNT(CASE WHEN COALESCE(ao.risk, '') IN ('CRITICAL', 'HIGH') THEN 1 END)::int AS high_risk_open
      FROM audit_observations ao
      INNER JOIN audits a ON a.id = ao.audit_id
      WHERE a.branch_id = $1
        AND ao.status IN ('OPEN', 'ACKNOWLEDGED')
      `,
      [branchId],
    );

    const [payrollSummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total_runs,
        COUNT(CASE WHEN pr.status = 'APPROVED' THEN 1 END)::int AS approved_runs,
        COUNT(CASE WHEN pr.status = 'SUBMITTED' THEN 1 END)::int AS pending_runs,
        COUNT(CASE WHEN pr.status IN ('REJECTED', 'DRAFT') THEN 1 END)::int AS exception_runs
      FROM payroll_runs pr
      WHERE pr.branch_id = $1
        AND ($2::int IS NULL OR pr.period_year = $2)
        AND ($3::int IS NULL OR pr.period_month = $3)
      `,
      [branchId, year, month],
    );

    const [contractorSummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(DISTINCT bc.contractor_user_id)::int AS contractor_count
      FROM branch_contractor bc
      WHERE bc.branch_id = $1
      `,
      [branchId],
    );

    const [querySummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS open_queries
      FROM notifications nt
      WHERE nt.branch_id = $1
        AND nt.status IN ('OPEN', 'IN_PROGRESS', 'RESPONDED')
      `,
      [branchId],
    );

    const [escalationSummary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS escalated_tasks
      FROM compliance_tasks ct
      WHERE ct.branch_id = $1
        AND ct.escalated_at IS NOT NULL
        AND ct.status <> 'APPROVED'
      `,
      [branchId],
    );

    const topIssues = await this.dataSource.query(
      `
      SELECT
        LEFT(COALESCE(ct.title, 'Compliance item'), 120) AS title,
        COUNT(*)::int AS count,
        CASE
          WHEN COUNT(CASE WHEN ct.status = 'OVERDUE' THEN 1 END) > 0 THEN 'HIGH'
          WHEN COUNT(CASE WHEN ct.status = 'IN_PROGRESS' THEN 1 END) > 0 THEN 'MEDIUM'
          ELSE 'LOW'
        END AS severity
      FROM compliance_tasks ct
      WHERE ct.branch_id = $1
        AND ($2::int IS NULL OR ct.period_year = $2)
        AND ($3::int IS NULL OR ct.period_month = $3)
      GROUP BY LEFT(COALESCE(ct.title, 'Compliance item'), 120)
      ORDER BY COUNT(*) DESC, title
      LIMIT 8
      `,
      [branchId, year, month],
    );

    const totalTasks = Number(taskSummary?.total || 0);
    const approvedTasks = Number(taskSummary?.approved || 0);
    const monthlyTotal = Number(taskSummary?.monthly_total || 0);
    const monthlyApproved = Number(taskSummary?.monthly_approved || 0);
    const returnsTotal = Number(taskSummary?.returns_total || 0);
    const returnsApproved = Number(taskSummary?.returns_approved || 0);

    const totalAudits = Number(auditSummary?.total_audits || 0);
    const completedAudits = Number(auditSummary?.completed_audits || 0);

    const payrollRuns = Number(payrollSummary?.total_runs || 0);
    const payrollExceptions = Number(payrollSummary?.exception_runs || 0);
    const contractorCount = Number(contractorSummary?.contractor_count || 0);
    const overdueItems = Number(taskSummary?.overdue || 0);
    const dueSoonItems = Number(taskSummary?.due_soon || 0);

    const overallCompliance =
      totalTasks > 0 ? Math.round((approvedTasks / totalTasks) * 100) : 0;
    const monthlyCompliance =
      monthlyTotal > 0 ? Math.round((monthlyApproved / monthlyTotal) * 100) : 0;
    const returnsCompliance =
      returnsTotal > 0 ? Math.round((returnsApproved / returnsTotal) * 100) : 0;
    const auditCompliance =
      totalAudits > 0 ? Math.round((completedAudits / totalAudits) * 100) : 0;

    const payrollRiskScore =
      payrollRuns > 0 ? Math.round((payrollExceptions / payrollRuns) * 100) : 0;
    const contractorRiskScore =
      totalTasks > 0 ? Math.round((overdueItems / totalTasks) * 100) : 0;

    return {
      branchId: branch.branchId,
      branchName: branch.branchName,
      clientId: branch.clientId,
      clientName: branch.clientName,
      state: branch.state,
      month: query?.month || null,
      complianceSummary: {
        overall: overallCompliance,
        mcd: monthlyCompliance,
        returns: returnsCompliance,
        audits: auditCompliance,
      },
      overdueItems,
      dueSoonItems,
      openQueries: Number(querySummary?.open_queries || 0),
      topIssues: topIssues || [],
      auditSummary: {
        planned: Number(auditSummary?.planned_audits || 0),
        ongoing: Number(auditSummary?.ongoing_audits || 0),
        completed: completedAudits,
        avgScore: Number(auditSummary?.avg_audit_score || 0),
        openHighRiskObservations: Number(
          observationSummary?.high_risk_open || 0,
        ),
      },
      payrollRisk: {
        totalRuns: payrollRuns,
        approvedRuns: Number(payrollSummary?.approved_runs || 0),
        pendingRuns: Number(payrollSummary?.pending_runs || 0),
        exceptionRuns: payrollExceptions,
        riskScore: payrollRiskScore,
      },
      contractorRisk: {
        contractorCount,
        pendingItems: dueSoonItems,
        overdueItems,
        riskScore: contractorRiskScore,
      },
      alerts: {
        escalatedTasks: Number(escalationSummary?.escalated_tasks || 0),
        openObservations: Number(observationSummary?.open_observations || 0),
        openQueries: Number(querySummary?.open_queries || 0),
      },
    };
  }

  /**
   * Get high-level executive summary KPIs
   */
  async getSummary(query: unknown) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM clients WHERE is_active = true AND is_deleted = false) AS total_clients,
        (SELECT COUNT(*) FROM client_branches b WHERE b.isactive = true AND b.isdeleted = false) AS total_branches,
        (SELECT COUNT(*) FROM users u JOIN roles r ON u.role_id = r.id
         WHERE r.code IN ('CCO', 'CRM', 'AUDITOR') AND u.is_active = true AND u.deleted_at IS NULL) AS team_size,
        (SELECT COUNT(*) FROM audits WHERE status IN ('PLANNED', 'IN_PROGRESS')) AS active_audits,
        (SELECT COUNT(*) FROM branch_compliances WHERE status = 'OVERDUE') AS overdue_compliances,
        (SELECT COUNT(*) FROM approval_requests WHERE status = 'PENDING') AS pending_approvals,
        COALESCE(
          (SELECT ROUND(AVG(CASE WHEN bc.status = 'COMPLIANT' THEN 100 ELSE 0 END), 2)
           FROM branch_compliances bc
           WHERE bc.created_at >= CURRENT_DATE - INTERVAL '30 days'),
          0
        ) AS compliance_score_30d
    `;

    const result = await this.dataSource.query(sql);
    return result[0] || {};
  }

  /**
   * Get client overview with branch counts and metrics
   */
  async getClientOverview(query: { limit?: number | string; offset?: number | string; search?: string }) {
    const limit = Number(query.limit) || 100;
    const offset = Number(query.offset) || 0;
    const search = query.search || '';

    const sql = `
      SELECT
        c.id,
        c.client_name,
        c.client_code,
        c.assigned_crm_id,
        c.assigned_auditor_id,
        crm.name as crm_name,
        auditor.name as auditor_name,
        (SELECT COUNT(*) FROM client_branches b WHERE b.clientid = c.id AND b.isactive = true AND b.isdeleted = false) as branch_count,
        (SELECT COUNT(*) FROM branch_compliances bc
         JOIN client_branches b ON bc.branch_id = b.id
         WHERE b.clientid = c.id AND bc.status = 'OVERDUE') as overdue_count,
        (SELECT COUNT(*) FROM audits a
         WHERE a.client_id = c.id AND a.status IN ('PLANNED', 'IN_PROGRESS')) as active_audits
      FROM clients c
      LEFT JOIN users crm ON c.assigned_crm_id = crm.id
      LEFT JOIN users auditor ON c.assigned_auditor_id = auditor.id
      WHERE c.is_active = true AND c.is_deleted = false
        ${search ? `AND (c.client_name ILIKE '%${search}%' OR c.client_code ILIKE '%${search}%')` : ''}
      ORDER BY c.client_name
      LIMIT $1 OFFSET $2
    `;

    return await this.dataSource.query(sql, [limit, offset]);
  }

  /**
   * Get CCO and CRM team performance metrics
   */
  async getCcoCrmPerformance(query: unknown) {
    const sql = `
      WITH team_metrics AS (
        SELECT
          u.id as user_id,
          u.name as user_name,
          u.email,
          r.code as role_code,
          COUNT(DISTINCT c.id) as client_count,
          COUNT(DISTINCT b.id) as branch_count,
          COUNT(DISTINCT CASE WHEN bc.status = 'OVERDUE' THEN bc.id END) as overdue_count,
          COALESCE(
            ROUND(AVG(CASE WHEN bc.status = 'COMPLIANT' THEN 100 ELSE 0 END), 2),
            0
          ) as compliance_score
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN clients c ON (
          (r.code = 'CRM' AND c.assigned_crm_id = u.id) OR
          (r.code = 'AUDITOR' AND c.assigned_auditor_id = u.id)
        )
        LEFT JOIN client_branches b ON b.clientid = c.id AND b.isactive = true AND b.isdeleted = false
        LEFT JOIN branch_compliances bc ON bc.branch_id = b.id
        WHERE r.code IN ('CCO', 'CRM', 'AUDITOR') AND u.is_active = true AND u.deleted_at IS NULL
        GROUP BY u.id, u.name, u.email, r.code
      )
      SELECT * FROM team_metrics
      ORDER BY role_code, user_name
    `;

    return await this.dataSource.query(sql);
  }

  /**
   * Get governance and compliance statistics
   */
  async getGovernanceCompliance(query: unknown) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM audits WHERE status = 'COMPLETED') as completed_audits,
        (SELECT COUNT(*) FROM audits WHERE status IN ('PLANNED', 'IN_PROGRESS')) as pending_audits,
        (SELECT COUNT(*) FROM audit_observations WHERE risk = 'CRITICAL' AND status = 'OPEN') as critical_observations,
        (SELECT COUNT(*) FROM branch_compliances WHERE status = 'COMPLIANT') as compliant_items,
        (SELECT COUNT(*) FROM branch_compliances WHERE status = 'OVERDUE') as overdue_items,
        (SELECT COUNT(*) FROM branch_compliances WHERE status = 'DUE_SOON') as due_soon_items,
        COALESCE(
          (SELECT ROUND(
            (COUNT(CASE WHEN status = 'COMPLIANT' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
            2
          ) FROM branch_compliances),
          0
        ) as overall_compliance_rate,
        COALESCE(
          (SELECT ROUND(
            (COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
            2
          ) FROM audits WHERE due_date >= CURRENT_DATE - INTERVAL '90 days'),
          0
        ) as audit_completion_rate_90d
    `;

    const result = await this.dataSource.query(sql);
    return result[0] || {};
  }

  /**
   * Get recent escalations requiring CEO attention
   */
  async getRecentEscalations(query: { limit?: number | string; offset?: number | string; status?: string }) {
    const limit = Number(query.limit) || 50;
    const offset = Number(query.offset) || 0;
    const status = query.status || 'PENDING';

    const sql = `
      SELECT
        ar.id,
        ar.request_type,
        ar.target_entity_type,
        ar.target_entity_id,
        ar.requester_user_id,
        ar.status,
        ar.reason,
        ar.created_at,
        ar.updated_at,
        u.name as requested_by_name,
        u.email as requested_by_email,
        CASE
          WHEN ar.target_entity_type = 'CLIENT' THEN (SELECT client_name FROM clients WHERE id = ar.target_entity_id::uuid)
          WHEN ar.target_entity_type = 'USER' THEN (SELECT name FROM users WHERE id = ar.target_entity_id::uuid)
          ELSE NULL
        END as entity_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_user_id = u.id
      WHERE 1=1
        ${status !== 'ALL' ? `AND ar.status = $3` : ''}
      ORDER BY ar.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const params = status !== 'ALL' ? [limit, offset, status] : [limit, offset];
    return await this.dataSource.query(sql, params);
  }

  /**
   * Get monthly compliance trend for the last N months
   * Returns compliance rate, overdue count, audit score per month
   */
  async getComplianceTrend(query: { months?: number | string }) {
    const months = Number(query.months) || 12;

    const sql = `
      WITH month_series AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month',
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) AS month_start
      ),
      monthly_compliance AS (
        SELECT
          date_trunc('month', bc.created_at) AS month_start,
          COUNT(*) AS total,
          COUNT(CASE WHEN bc.status = 'COMPLIANT' THEN 1 END) AS compliant,
          COUNT(CASE WHEN bc.status = 'OVERDUE' THEN 1 END) AS overdue
        FROM branch_compliances bc
        WHERE bc.created_at >= date_trunc('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month'
        GROUP BY date_trunc('month', bc.created_at)
      ),
      monthly_audits AS (
        SELECT
          date_trunc('month', a.due_date) AS month_start,
          COUNT(*) AS total_audits,
          COUNT(CASE WHEN a.status = 'COMPLETED' THEN 1 END) AS completed_audits,
          ROUND(AVG(CASE WHEN a.status = 'COMPLETED' THEN a.score ELSE NULL END)::numeric, 1) AS avg_score
        FROM audits a
        WHERE a.due_date >= date_trunc('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month'
        GROUP BY date_trunc('month', a.due_date)
      )
      SELECT
        to_char(ms.month_start, 'YYYY-MM') AS month,
        COALESCE(mc.total, 0)::int AS total_items,
        COALESCE(mc.compliant, 0)::int AS compliant_items,
        COALESCE(mc.overdue, 0)::int AS overdue_items,
        CASE WHEN COALESCE(mc.total, 0) > 0
          THEN ROUND((mc.compliant::numeric / mc.total) * 100, 1)
          ELSE 0
        END AS compliance_rate,
        COALESCE(ma.total_audits, 0)::int AS total_audits,
        COALESCE(ma.completed_audits, 0)::int AS completed_audits,
        COALESCE(ma.avg_score, 0) AS avg_audit_score
      FROM month_series ms
      LEFT JOIN monthly_compliance mc ON mc.month_start = ms.month_start
      LEFT JOIN monthly_audits ma ON ma.month_start = ms.month_start
      ORDER BY ms.month_start
    `;

    return await this.dataSource.query(sql, [months]);
  }

  /**
   * Get top and bottom branch rankings for executive view.
   * Ranking is based on overdue ratio for the selected month.
   */
  async getBranchRankings(query: { limit?: number | string; month?: string }) {
    const limit = Math.max(1, Math.min(Number(query.limit) || 10, 25));
    const { startDate, endDate } = this.resolveMonthBounds(query.month);

    const baseSql = `
      SELECT
        b.id,
        b.branchname AS branch_name,
        c.client_name,
        COUNT(bc.id)::int AS total_items,
        COUNT(CASE WHEN bc.status = 'COMPLIANT' THEN 1 END)::int AS compliant_count,
        COUNT(CASE WHEN bc.status = 'OVERDUE' THEN 1 END)::int AS overdue_count,
        COALESCE(
          ROUND(
            (COUNT(CASE WHEN bc.status = 'COMPLIANT' THEN 1 END)::numeric / NULLIF(COUNT(bc.id), 0)) * 100,
            1
          ),
          0
        ) AS compliance_rate,
        COALESCE(
          ROUND(
            (COUNT(CASE WHEN bc.status = 'OVERDUE' THEN 1 END)::numeric / NULLIF(COUNT(bc.id), 0)) * 100,
            1
          ),
          0
        ) AS risk_score
      FROM client_branches b
      INNER JOIN clients c ON c.id = b.clientid
      LEFT JOIN branch_compliances bc
        ON bc.branch_id = b.id
       AND ($1::date IS NULL OR bc.created_at::date >= $1::date)
       AND ($2::date IS NULL OR bc.created_at::date < $2::date)
      WHERE b.isactive = true
        AND b.isdeleted = false
        AND c.is_deleted = false
      GROUP BY b.id, b.branchname, c.client_name
      HAVING COUNT(bc.id) > 0
    `;

    const topRisk = await this.dataSource.query(
      `${baseSql}
       ORDER BY risk_score DESC, overdue_count DESC, branch_name
       LIMIT $3`,
      [startDate, endDate, limit],
    );

    const bottomRisk = await this.dataSource.query(
      `${baseSql}
       ORDER BY risk_score ASC, overdue_count ASC, branch_name
       LIMIT $3`,
      [startDate, endDate, limit],
    );

    return {
      month: query.month || null,
      topRisk,
      bottomRisk,
    };
  }

  /**
   * Get monthly audit closure trend for board-level monitoring.
   */
  async getAuditClosureTrend(query: { months?: number | string }) {
    const months = Math.max(3, Math.min(Number(query.months) || 12, 24));

    const sql = `
      WITH month_series AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month',
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) AS month_start
      ),
      monthly_audits AS (
        SELECT
          date_trunc('month', COALESCE(a.updated_at, a.due_date, a.created_at)) AS month_start,
          COUNT(*)::int AS total_audits,
          COUNT(CASE WHEN a.status = 'COMPLETED' THEN 1 END)::int AS completed_audits,
          COUNT(CASE WHEN a.status IN ('PLANNED', 'IN_PROGRESS') THEN 1 END)::int AS open_audits
        FROM audits a
        WHERE COALESCE(a.updated_at, a.due_date, a.created_at) >=
              date_trunc('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month'
        GROUP BY date_trunc('month', COALESCE(a.updated_at, a.due_date, a.created_at))
      )
      SELECT
        to_char(ms.month_start, 'YYYY-MM') AS month,
        COALESCE(ma.total_audits, 0)::int AS total_audits,
        COALESCE(ma.completed_audits, 0)::int AS completed_audits,
        COALESCE(ma.open_audits, 0)::int AS open_audits,
        CASE
          WHEN COALESCE(ma.total_audits, 0) > 0
            THEN ROUND((ma.completed_audits::numeric / ma.total_audits) * 100, 1)
          ELSE 0
        END AS closure_rate
      FROM month_series ms
      LEFT JOIN monthly_audits ma ON ma.month_start = ms.month_start
      ORDER BY ms.month_start
    `;

    return await this.dataSource.query(sql, [months]);
  }
}
