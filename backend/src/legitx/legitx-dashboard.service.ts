import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../common/db/db.service';
import {
  LegitxCharts,
  LegitxDashboardResponse,
  LegitxDashboardScope,
  LegitxKpiBlock,
  LegitxMeta,
  LegitxQueueItem,
  LegitxQueues,
  LegitxToggle,
} from './legitx-dashboard.types';

interface BranchRankRow {
  id: string | null;
  name: string | null;
  percent: number;
}

interface EnforcementRow {
  branch_id: string;
  event_type: string;
  authority: string | null;
  event_date: string;
  reference_no: string | null;
  status: string | null;
}

@Injectable()
export class LegitxDashboardService {
  private readonly logger = new Logger(LegitxDashboardService.name);

  constructor(private readonly db: DbService) {}

  async getSummary(
    userId: string,
    query: any,
    clientId?: string | null,
  ): Promise<LegitxDashboardResponse> {
    const scope = this.parseScope(query, clientId);
    const meta = await this.getMeta(scope);

    const [
      employees,
      employeeStatus,
      contractors,
      contractorDocsBuckets,
      payroll,
      branches,
      complianceKpi,
      complianceTrend,
      complianceOps,
      branchRanking,
      auditKpi,
    ] = await Promise.all([
      this.getEmployees(scope),
      this.getEmployeeStatusTrend(scope),
      this.getContractors(scope),
      this.getContractorDocsBuckets(scope),
      this.getPayroll(scope),
      this.getBranchKpi(scope),
      this.getComplianceKpis(scope),
      this.getComplianceTrend(scope),
      this.getComplianceOps(scope),
      this.getBranchComplianceRanking(scope),
      this.getAuditKpis(scope),
    ]);

    const queues = await this.getQueues(
      scope,
      branchRanking,
      meta,
      payroll,
      complianceOps,
    );

    const charts: LegitxCharts = {
      complianceTrend,
      complianceOps,
      branchComplianceRanking: branchRanking,
      auditCompletion: {
        completed: auditKpi.completed,
        pending: auditKpi.pending,
        overdue: auditKpi.overdue,
        overallScore: auditKpi.overallAuditScore,
      },
      payrollExceptions: {
        pendingQueries: payroll.pendingQueries,
        pfPendingEmployees: payroll.pfPendingEmployees,
        esiPendingEmployees: payroll.esiPendingEmployees,
        pendingFF: payroll.pendingFF,
        completedFF: payroll.completedFF,
      },
      employeeStatus,
      contractorDocsBuckets,
    };

    const kpis: LegitxKpiBlock = {
      employees,
      contractors,
      payroll,
      branches,
      compliance: complianceKpi,
      audits: auditKpi,
    };

    return { scope, kpis, charts, queues, meta };
  }

  private parseScope(
    query: any,
    clientId?: string | null,
  ): LegitxDashboardScope {
    const now = new Date();
    const month = this.toInt(query.month, now.getMonth() + 1);
    const year = this.toInt(query.year, now.getFullYear());
    const branchId =
      query.branchId && query.branchId !== 'ALL'
        ? String(query.branchId)
        : null;
    const contractorId =
      query.contractorId && query.contractorId !== 'ALL'
        ? String(query.contractorId)
        : null;
    const toggle = ['ALL', 'CRITICAL', 'PENDING'].includes(query.toggle)
      ? (query.toggle as LegitxToggle)
      : 'ALL';
    return {
      month,
      year,
      branchId,
      contractorId,
      clientId: clientId ?? null,
      toggle,
    };
  }

  private toInt(value: any, fallback: number): number {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  private async getMeta(scope: LegitxDashboardScope): Promise<LegitxMeta> {
    const branchParams: any[] = [];
    const branchConditions = ['isdeleted = false', 'isactive = true'];
    if (scope.clientId) {
      branchParams.push(scope.clientId);
      branchConditions.push(`clientid = $${branchParams.length}`);
    }

    const contractorParams: any[] = [];
    const contractorConditions: string[] = [];
    if (scope.clientId) {
      contractorParams.push(scope.clientId);
      contractorConditions.push(`bc.client_id = $${contractorParams.length}`);
    }
    if (scope.branchId) {
      contractorParams.push(scope.branchId);
      contractorConditions.push(`bc.branch_id = $${contractorParams.length}`);
    }

    const [branches, contractors] = await Promise.all([
      this.safeMany<{ id: string; name: string }>(
        `SELECT id,
                COALESCE(branchname, 'Branch') AS name
         FROM client_branches
         WHERE ${branchConditions.join(' AND ')}
         ORDER BY branchname`,
        branchParams,
        [],
      ),
      this.safeMany<{ id: string; name: string; branchId: string | null }>(
        `SELECT bc.contractor_user_id AS id,
                COALESCE(u.name, u.email, 'Contractor') AS name,
          bc.branch_id AS "branchId"
         FROM branch_contractor bc
         LEFT JOIN users u ON u.id = bc.contractor_user_id
         ${contractorConditions.length ? `WHERE ${contractorConditions.join(' AND ')}` : ''}
         ORDER BY name`,
        contractorParams,
        [],
      ),
    ]);

    return {
      branches,
      contractors: contractors.map((c) => ({
        ...c,
        branchId: c.branchId ?? undefined,
      })),
    };
  }

  private async getEmployees(scope: LegitxDashboardScope) {
    const fallback = {
      total: 0,
      male: 0,
      female: 0,
      active: 0,
      joiners: 0,
      left: 0,
      absconded: 0,
    };

    // Build date range for the requested month/year
    const params: any[] = [scope.year, scope.month];
    const branchFilter: string[] = [];

    if (scope.branchId) {
      params.push(scope.branchId);
      branchFilter.push(`e.branch_id = $${params.length}`);
    } else if (scope.clientId) {
      params.push(scope.clientId);
      branchFilter.push(`e.client_id = $${params.length}`);
    }

    const whereBase = branchFilter.length
      ? `AND ${branchFilter.join(' AND ')}`
      : '';

    // Derive HR snapshot from the employees table:
    //  - total / male / female / active: employees whose date_of_joining <= end-of-month and (date_of_exit IS NULL or date_of_exit >= start-of-month)
    //  - joiners: date_of_joining falls within the month
    //  - left: date_of_exit falls within the month
    //  - absconded: not tracked yet, return 0
    const row = await this.safeOne(
      `WITH month_range AS (
         SELECT
           make_date($1::int, $2::int, 1) AS start_dt,
           (make_date($1::int, $2::int, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_dt
       )
       SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN e.gender = 'M' THEN 1 END)::int AS male,
         COUNT(CASE WHEN e.gender = 'F' THEN 1 END)::int AS female,
         COUNT(CASE WHEN e.is_active = true THEN 1 END)::int AS active,
         COUNT(CASE WHEN e.date_of_joining >= mr.start_dt AND e.date_of_joining <= mr.end_dt THEN 1 END)::int AS joiners,
         COUNT(CASE WHEN e.date_of_exit >= mr.start_dt AND e.date_of_exit <= mr.end_dt THEN 1 END)::int AS left,
         0::int AS absconded
       FROM employees e, month_range mr
       WHERE (e.date_of_joining IS NULL OR e.date_of_joining <= mr.end_dt)
         AND (e.date_of_exit IS NULL OR e.date_of_exit >= mr.start_dt)
         ${whereBase}`,
      params,
      fallback,
    );

    return row;
  }

  private async getEmployeeStatusTrend(scope: LegitxDashboardScope) {
    const months = this.lastMonths(scope.month, scope.year, 6);

    const branchFilter: string[] = [];
    const params: any[] = [];

    if (scope.branchId) {
      params.push(scope.branchId);
      branchFilter.push(`e.branch_id = $${params.length}`);
    } else if (scope.clientId) {
      params.push(scope.clientId);
      branchFilter.push(`e.client_id = $${params.length}`);
    }

    const whereExtra = branchFilter.length
      ? `AND ${branchFilter.join(' AND ')}`
      : '';

    // Derive per-month stats from the employees table
    // For each of the 6 months, count active employees in that month,
    // joiners (date_of_joining in month), and leavers (date_of_exit in month).
    const unionParts = months.map((m) => {
      const startDt = `'${m.year}-${String(m.month).padStart(2, '0')}-01'::date`;
      const endDt = `(${startDt} + INTERVAL '1 month' - INTERVAL '1 day')::date`;
      return `SELECT
          ${m.month} AS month, ${m.year} AS year,
          COUNT(CASE WHEN e.is_active = true OR (e.date_of_exit IS NOT NULL AND e.date_of_exit >= ${startDt}) THEN 1 END)::int AS active,
          COUNT(CASE WHEN e.date_of_joining >= ${startDt} AND e.date_of_joining <= ${endDt} THEN 1 END)::int AS joiners,
          COUNT(CASE WHEN e.date_of_exit >= ${startDt} AND e.date_of_exit <= ${endDt} THEN 1 END)::int AS left,
          0::int AS absconded
        FROM employees e
        WHERE (e.date_of_joining IS NULL OR e.date_of_joining <= ${endDt})
          AND (e.date_of_exit IS NULL OR e.date_of_exit >= ${startDt})
          ${whereExtra}`;
    });

    const rows = await this.safeMany<{
      month: number;
      year: number;
      active: number;
      joiners: number;
      left: number;
      absconded: number;
    }>(unionParts.join(' UNION ALL ') + ' ORDER BY year, month', params, []);

    const labels: string[] = [];
    const active: number[] = [];
    const joiners: number[] = [];
    const left: number[] = [];
    const absconded: number[] = [];

    months
      .slice()
      .reverse()
      .forEach((m) => {
        const row = rows.find((r) => r.month === m.month && r.year === m.year);
        labels.push(m.label);
        active.push(row?.active ?? 0);
        joiners.push(row?.joiners ?? 0);
        left.push(row?.left ?? 0);
        absconded.push(row?.absconded ?? 0);
      });

    return { labels, active, joiners, left, absconded };
  }

  private async getContractors(scope: LegitxDashboardScope) {
    const fallback = { total: 0, male: 0, female: 0 };
    const params: any[] = [];
    const where: string[] = [];

    if (scope.clientId) {
      params.push(scope.clientId);
      where.push(`bc.client_id = $${params.length}`);
    }
    if (scope.branchId) {
      params.push(scope.branchId);
      where.push(`bc.branch_id = $${params.length}`);
    }
    if (scope.contractorId) {
      params.push(scope.contractorId);
      where.push(`bc.contractor_user_id = $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const row = await this.safeOne(
      `SELECT 
         COUNT(*)::int AS total,
         COUNT(CASE WHEN emp.gender = 'M' THEN 1 END)::int AS male,
         COUNT(CASE WHEN emp.gender = 'F' THEN 1 END)::int AS female
      FROM branch_contractor bc
      LEFT JOIN users u ON u.id = bc.contractor_user_id
      LEFT JOIN employees emp ON emp.id = u.employee_id
       ${whereClause}`,
      params,
      fallback,
    );

    return row;
  }

  private async getContractorDocsBuckets(scope: LegitxDashboardScope) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (scope.clientId) {
      params.push(scope.clientId);
      conditions.push(`client_id = $${params.length}`);
    }
    if (scope.branchId) {
      params.push(scope.branchId);
      conditions.push(`branch_id = $${params.length}`);
    }
    if (scope.contractorId) {
      params.push(scope.contractorId);
      conditions.push(`contractor_user_id = $${params.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const rows = await this.safeMany<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count
       FROM contractor_documents
       ${whereClause}
       GROUP BY status`,
      params,
      [],
    );

    const buckets = [
      'UPLOADED',
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
    ];
    return {
      labels: buckets,
      values: buckets.map((s) => rows.find((r) => r.status === s)?.count ?? 0),
    };
  }

  private async getPayroll(scope: LegitxDashboardScope) {
    const fallback = {
      pendingQueries: 0,
      pendingEmployees: 0,
      pfPendingEmployees: 0,
      esiPendingEmployees: 0,
      completedFF: 0,
      pendingFF: 0,
    };

    const params: any[] = [scope.year, scope.month];
    const whereRuns: string[] = [
      `status NOT IN ('CANCELLED')`,
      `period_year = $1`,
      `period_month = $2`,
    ];

    if (scope.clientId) {
      params.push(scope.clientId);
      whereRuns.push(`client_id = $${params.length}`);
    }
    if (scope.branchId) {
      params.push(scope.branchId);
      whereRuns.push(`(branch_id = $${params.length} OR branch_id IS NULL)`);
    }

    const row = await this.safeOne(
      `WITH latest_run AS (
         SELECT id, period_year, period_month
         FROM payroll_runs
         ${whereRuns.length ? `WHERE ${whereRuns.join(' AND ')}` : ''}
         ORDER BY period_year DESC, period_month DESC
         LIMIT 1
       )
       SELECT
         0::int AS "pendingQueries",
         0::int AS "pendingEmployees",
         COALESCE(SUM(CASE WHEN pre.uan IS NULL OR pre.uan = '' THEN 1 END), 0)::int AS "pfPendingEmployees",
         COALESCE(SUM(CASE WHEN pre.esic IS NULL OR pre.esic = '' THEN 1 END), 0)::int AS "esiPendingEmployees",
         0::int AS "completedFF",
         0::int AS "pendingFF"
       FROM payroll_run_employees pre
       JOIN latest_run lr ON lr.id = pre.run_id`,
      params,
      fallback,
    );

    return row;
  }

  private async getBranchKpi(scope: LegitxDashboardScope) {
    const params: any[] = [];
    const conditions = ['isdeleted = false', 'isactive = true'];
    if (scope.clientId) {
      params.push(scope.clientId);
      conditions.push(`clientid = $${params.length}`);
    }
    if (scope.branchId) {
      params.push(scope.branchId);
      conditions.push(`id = $${params.length}`);
    }

    const row = await this.safeOne(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS live,
         COUNT(CASE WHEN status = 'CLOSED' THEN 1 END)::int AS closed
       FROM client_branches
       WHERE ${conditions.join(' AND ')}`,
      params,
      { total: 0, live: 0, closed: 0 },
    );

    return row;
  }

  private async getComplianceKpis(scope: LegitxDashboardScope) {
    const compParams: any[] = [];
    const compConditions: string[] = [];

    if (scope.clientId) {
      compParams.push(scope.clientId);
      compConditions.push(`bc.client_id = $${compParams.length}`);
    }
    if (scope.branchId) {
      compParams.push(scope.branchId);
      compConditions.push(`bc.branch_id = $${compParams.length}`);
    }

    const compWhere = compConditions.length
      ? `WHERE ${compConditions.join(' AND ')}`
      : '';

    const row = await this.safeOne(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status = 'COMPLIANT' THEN 1 END)::int AS compliant
       FROM branch_compliances bc
       ${compWhere}`,
      compParams,
      { total: 0, compliant: 0 },
    );

    const overallPercent = row.total
      ? Math.round((row.compliant / row.total) * 100)
      : 0;

    return {
      overallPercent,
      branchAvgPercent: overallPercent,
      contractorAvgPercent: overallPercent,
    };
  }

  private async getComplianceTrend(scope: LegitxDashboardScope) {
    const months = this.lastMonths(scope.month, scope.year, 6);
    const labels: string[] = [];
    const overall: number[] = [];
    const branchAvg: number[] = [];
    const contractorAvg: number[] = [];

    const minKey = months[months.length - 1].key;
    const maxKey = months[0].key;

    const trendParams: any[] = [minKey, maxKey];
    const trendConditions = [
      '(EXTRACT(YEAR FROM created_at)::int * 12 + EXTRACT(MONTH FROM created_at)::int) BETWEEN $1 AND $2',
    ];

    if (scope.clientId) {
      trendParams.push(scope.clientId);
      trendConditions.push(`bc.client_id = $${trendParams.length}`);
    }
    if (scope.branchId) {
      trendParams.push(scope.branchId);
      trendConditions.push(`bc.branch_id = $${trendParams.length}`);
    }

    const rows = await this.safeMany<{
      month: number;
      year: number;
      total: number;
      compliant: number;
    }>(
      `SELECT
         EXTRACT(MONTH FROM created_at)::int AS month,
         EXTRACT(YEAR FROM created_at)::int AS year,
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status = 'COMPLIANT' THEN 1 END)::int AS compliant
       FROM branch_compliances bc
       WHERE ${trendConditions.join(' AND ')}
       GROUP BY year, month
       ORDER BY year, month`,
      trendParams,
      [],
    );

    months
      .slice()
      .reverse()
      .forEach((m) => {
        const row = rows.find((r) => r.month === m.month && r.year === m.year);
        const pct =
          row && row.total ? Math.round((row.compliant / row.total) * 100) : 0;
        labels.push(m.label);
        overall.push(pct);
        branchAvg.push(pct);
        contractorAvg.push(pct);
      });

    return { labels, overall, branchAvg, contractorAvg };
  }

  private async getComplianceOps(scope: LegitxDashboardScope) {
    const opsParams: any[] = [scope.month, scope.year];

    let scopeFilter = '';
    if (scope.branchId) {
      opsParams.push(scope.branchId);
      scopeFilter = `AND ct.branch_id = $3`;
    } else if (scope.clientId) {
      opsParams.push(scope.clientId);
      scopeFilter = `AND ct.branch_id IN (SELECT id FROM client_branches WHERE clientid = $3 AND isdeleted = false)`;
    }

    let returnScopeFilter = '';
    if (scope.branchId) {
      returnScopeFilter = `AND cr.branch_id = $3`;
    } else if (scope.clientId) {
      returnScopeFilter = `AND cr.branch_id IN (SELECT id FROM client_branches WHERE clientid = $3 AND isdeleted = false)`;
    }

    // Derive MCD / returns data from compliance_tasks + compliance_mcd_items + compliance_returns
    const mcdSql = `
      WITH task_mcd AS (
        SELECT
          COUNT(CASE WHEN mi.status IN ('SUBMITTED','VERIFIED') THEN 1 END)::int AS mcd_submitted,
          COUNT(CASE WHEN mi.status = 'PENDING' THEN 1 END)::int AS mcd_pending
        FROM compliance_tasks ct
        JOIN compliance_mcd_items mi ON mi.task_id = ct.id
        WHERE ct.period_month = $1 AND ct.period_year = $2
          ${scopeFilter}
      ),
      returns_agg AS (
        SELECT
          COUNT(CASE WHEN cr.status IN ('SUBMITTED','APPROVED') THEN 1 END)::int AS returns_filed,
          COUNT(CASE WHEN cr.status IN ('PENDING','IN_PROGRESS') THEN 1 END)::int AS returns_pending,
          COUNT(CASE WHEN cr.status = 'REJECTED' THEN 1 END)::int AS amendments_open,
          COUNT(CASE WHEN cr.due_date < NOW() AND cr.status NOT IN ('SUBMITTED','APPROVED') THEN 1 END)::int AS renewals_overdue
        FROM compliance_returns cr
        WHERE cr.period_month = $1 AND cr.period_year = $2 AND cr.is_deleted = false
          ${returnScopeFilter}
      )
      SELECT
        CONCAT(LPAD($1::text, 2, '0'), '/', $2::text) AS label,
        COALESCE(m.mcd_submitted + r.returns_filed, 0)::int AS done,
        COALESCE(m.mcd_pending + r.returns_pending + r.amendments_open, 0)::int AS pending,
        COALESCE(r.renewals_overdue, 0)::int AS overdue
      FROM task_mcd m, returns_agg r
    `;

    const rows = await this.safeMany<{
      label: string;
      done: number;
      pending: number;
      overdue: number;
    }>(mcdSql, opsParams, []);

    if (rows.length) {
      return {
        labels: rows.map((r) => r.label),
        done: rows.map((r) => r.done),
        pending: rows.map((r) => r.pending),
        overdue: rows.map((r) => r.overdue),
      };
    }

    const label = this.monthLabel(scope.month, scope.year);
    return { labels: [label], done: [0], pending: [0], overdue: [0] };
  }

  private async getBranchComplianceRanking(scope: LegitxDashboardScope) {
    const params: any[] = [];
    const conditions = ['b.isdeleted = false', 'b.isactive = true'];
    if (scope.clientId) {
      params.push(scope.clientId);
      conditions.push(`b.clientid = $${params.length}`);
    }
    if (scope.branchId) {
      params.push(scope.branchId);
      conditions.push(`b.id = $${params.length}`);
    }

    const rows = await this.safeMany<BranchRankRow>(
      `SELECT
         b.id,
         COALESCE(b.branchname, 'Branch') AS name,
         COALESCE(
           ROUND(
             (COUNT(CASE WHEN bc.status = 'COMPLIANT' THEN 1 END)::numeric / NULLIF(COUNT(bc.*), 0)) * 100,
             2
           ),
           0
         ) AS percent
       FROM client_branches b
       LEFT JOIN branch_compliances bc ON bc.branch_id = b.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY b.id, b.branchname
       ORDER BY percent DESC NULLS LAST
       LIMIT 10`,
      params,
      [],
    );

    return {
      labels: rows.map((r) => r.name || 'Branch'),
      values: rows.map((r) => Number(r.percent || 0)),
      branchIds: rows.map((r) => r.id || ''),
    };
  }

  private async getAuditKpis(scope: LegitxDashboardScope) {
    const params: any[] = [];
    const conditions: string[] = [];
    if (scope.clientId) {
      params.push(scope.clientId);
      conditions.push(`a.client_id = $${params.length}`);
    } else if (scope.branchId) {
      // Audits are at client level (no branch_id column); resolve clientId from the selected branch
      params.push(scope.branchId);
      conditions.push(
        `a.client_id = (SELECT clientid FROM client_branches WHERE id = $${params.length} LIMIT 1)`,
      );
    }

    const row = await this.safeOne(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
         COUNT(*) FILTER (WHERE status IN ('PLANNED', 'IN_PROGRESS'))::int AS pending,
         COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED') AND due_date IS NOT NULL AND due_date < NOW())::int AS overdue
       FROM audits a
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}`,
      params,
      { completed: 0, pending: 0, overdue: 0 },
    );

    const total = row.completed + row.pending + row.overdue;
    const overallAuditScore = total
      ? Math.round((row.completed / total) * 100)
      : 0;

    return { ...row, overallAuditScore };
  }

  private async getQueues(
    scope: LegitxDashboardScope,
    branchRanking: {
      labels: string[];
      values: number[];
      branchIds?: Array<string | number>;
    },
    meta: LegitxMeta,
    payroll: LegitxKpiBlock['payroll'],
    complianceOps: LegitxCharts['complianceOps'],
  ): Promise<LegitxQueues> {
    const critical: LegitxQueueItem[] = [];
    const pending: LegitxQueueItem[] = [];
    const branchNameMap = new Map<string, string>();
    meta.branches?.forEach((b) => branchNameMap.set(b.id.toString(), b.name));
    const scopeBranchName = scope.branchId
      ? branchNameMap.get(scope.branchId.toString())
      : undefined;

    // AuditTrack low compliance branches
    branchRanking.values.forEach((v, idx) => {
      if (v < 60) {
        const branchId = branchRanking.branchIds?.[idx]?.toString() || null;
        critical.push({
          type: 'LOW_COMPLIANCE_BRANCH',
          branchId,
          branchName: branchId ? branchNameMap.get(branchId) : undefined,
          label: `Low compliance (${v}%)`,
          ageDays: 0,
          owner: 'AuditTrack',
        });
      }
    });

    // BranchDesk inspections / showcause
    // branch_enforcement_events table does not exist yet — skip enforcement queue items.
    // When the table is created in a future migration, re-enable this block.
    const enforcementRows: EnforcementRow[] = [];

    enforcementRows.forEach((row) => {
      const ageDays = this.ageFromDate(row.event_date);
      const item: LegitxQueueItem = {
        type: row.event_type,
        branchId: row.branch_id,
        branchName: branchNameMap.get(row.branch_id),
        label: row.reference_no || row.event_type,
        ageDays,
        owner: 'BranchDesk',
      };
      if (
        row.event_type === 'INSPECTION_FAILED' ||
        row.event_type === 'SHOWCAUSE'
      ) {
        critical.push(item);
      } else {
        pending.push(item);
      }
    });

    // PayDek payroll exceptions (PF/ESI pending counts)
    if ((payroll.pfPendingEmployees ?? 0) > 0) {
      pending.push({
        type: 'PAYROLL_PF_PENDING',
        branchId: scope.branchId,
        branchName: scopeBranchName,
        label: 'PF pending employees',
        ageDays: 0,
        owner: 'PayDek',
      });
    }
    if ((payroll.esiPendingEmployees ?? 0) > 0) {
      pending.push({
        type: 'PAYROLL_ESI_PENDING',
        branchId: scope.branchId,
        branchName: scopeBranchName,
        label: 'ESI pending employees',
        ageDays: 0,
        owner: 'PayDek',
      });
    }

    // CRM renewals/returns/MCD pending/overdue
    complianceOps.labels.forEach((label, idx) => {
      const overdue = complianceOps.overdue?.[idx] ?? 0;
      if (overdue > 0) {
        critical.push({
          type: 'RENEWAL_OVERDUE',
          branchId: scope.branchId,
          branchName: scopeBranchName,
          label: `${label}: renewals overdue (${overdue})`,
          ageDays: 0,
          owner: 'CRM',
        });
      }
      const pendingVal = complianceOps.pending?.[idx] ?? 0;
      if (pendingVal > 0) {
        pending.push({
          type: 'MCD_PENDING',
          branchId: scope.branchId,
          branchName: scopeBranchName,
          label: `${label}: compliance items pending (${pendingVal})`,
          ageDays: 0,
          owner: 'CRM',
        });
      }
    });

    if (scope.toggle === 'CRITICAL') {
      return { critical, pending: [] };
    }
    if (scope.toggle === 'PENDING') {
      return { critical: [], pending };
    }

    return { critical, pending };
  }

  private lastMonths(month: number, year: number, count: number) {
    const out: { month: number; year: number; key: number; label: string }[] =
      [];
    let m = month;
    let y = year;
    for (let i = 0; i < count; i++) {
      const key = y * 12 + m;
      out.push({ month: m, year: y, key, label: this.monthLabel(m, y) });
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }

  private monthLabel(month: number, year: number) {
    const names = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${names[Math.max(1, Math.min(12, month)) - 1]} ${year}`;
  }

  private ageFromDate(dateStr: string | null | undefined) {
    if (!dateStr) return 0;
    const dt = new Date(dateStr);
    if (Number.isNaN(dt.getTime())) return 0;
    const diff = Date.now() - dt.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  private async safeOne<T>(
    sql: string,
    params: any[],
    fallback: T,
  ): Promise<T> {
    try {
      const row = await this.db.one<T>(sql, params);
      return (row as T) ?? fallback;
    } catch (err: any) {
      this.logger.debug(`SQL one failed: ${err?.message ?? err}`);
      return fallback;
    }
  }

  private async safeMany<T>(
    sql: string,
    params: any[],
    fallback: T[],
  ): Promise<T[]> {
    try {
      return (await this.db.many<T>(sql, params)) ?? fallback;
    } catch (err: any) {
      this.logger.debug(`SQL many failed: ${err?.message ?? err}`);
      return fallback;
    }
  }
}
