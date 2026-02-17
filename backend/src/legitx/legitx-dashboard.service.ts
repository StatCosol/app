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

  private parseScope(query: any, clientId?: string | null): LegitxDashboardScope {
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
    return { month, year, branchId, contractorId, clientId: clientId ?? null, toggle };
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

    const row = await this.safeOne(
      `SELECT
         COALESCE(SUM(headcount_total), 0)::int AS total,
         COALESCE(SUM(male), 0)::int AS male,
         COALESCE(SUM(female), 0)::int AS female,
         COALESCE(SUM(active), 0)::int AS active,
         COALESCE(SUM(joiners), 0)::int AS joiners,
         COALESCE(SUM(left_count), 0)::int AS left,
         COALESCE(SUM(absconded), 0)::int AS absconded
       FROM branch_hr_monthly_snapshot
       WHERE month = $1 AND year = $2
         ${scope.branchId ? 'AND branch_id = $3' : ''}`,
      scope.branchId
        ? [scope.month, scope.year, scope.branchId]
        : [scope.month, scope.year],
      fallback,
    );

    return row;
  }

  private async getEmployeeStatusTrend(scope: LegitxDashboardScope) {
    const months = this.lastMonths(scope.month, scope.year, 6);
    const minKey = months[months.length - 1].key;
    const maxKey = months[0].key;

    const rows = await this.safeMany<{
      month: number;
      year: number;
      active: number;
      joiners: number;
      left: number;
      absconded: number;
    }>(
      `SELECT month, year,
              COALESCE(SUM(active), 0)::int AS active,
              COALESCE(SUM(joiners), 0)::int AS joiners,
              COALESCE(SUM(left_count), 0)::int AS left,
              COALESCE(SUM(absconded), 0)::int AS absconded
       FROM branch_hr_monthly_snapshot
       WHERE (year * 12 + month) BETWEEN $1 AND $2
         ${scope.branchId ? 'AND branch_id = $3' : ''}
       GROUP BY month, year
       ORDER BY year, month`,
      scope.branchId ? [minKey, maxKey, scope.branchId] : [minKey, maxKey],
      [],
    );

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
         COUNT(CASE WHEN u.gender = 'M' THEN 1 END)::int AS male,
         COUNT(CASE WHEN u.gender = 'F' THEN 1 END)::int AS female
      FROM branch_contractor bc
      LEFT JOIN users u ON u.id = bc.contractor_user_id
       ${whereClause}`,
      params,
      fallback,
    );

    return row;
  }

  private async getContractorDocsBuckets(scope: LegitxDashboardScope) {
    const rows = await this.safeMany<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count
       FROM contractor_documents
       ${scope.branchId ? 'WHERE branch_id = $1' : ''}
       GROUP BY status`,
      scope.branchId ? [scope.branchId] : [],
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

    // Placeholder query; extend when PayDek exceptions tables are present.
    const params: any[] = [];
    const whereRuns: string[] = [`status NOT IN ('CANCELLED')`];
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
    const row = await this.safeOne(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status = 'COMPLIANT' THEN 1 END)::int AS compliant
       FROM branch_compliances bc
       ${scope.branchId ? 'WHERE bc.branch_id = $1' : ''}`,
      scope.branchId ? [scope.branchId] : [],
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
       WHERE (EXTRACT(YEAR FROM created_at)::int * 12 + EXTRACT(MONTH FROM created_at)::int) BETWEEN $1 AND $2
         ${scope.branchId ? 'AND bc.branch_id = $3' : ''}
       GROUP BY year, month
       ORDER BY year, month`,
      scope.branchId ? [minKey, maxKey, scope.branchId] : [minKey, maxKey],
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
    const rows = await this.safeMany<{
      label: string;
      done: number;
      pending: number;
      overdue: number;
    }>(
      `SELECT
         CONCAT(LPAD($1::text, 2, '0'), '/', $2::text) AS label,
         COALESCE(SUM(mcd_submitted + returns_filed + renewals_completed), 0)::int AS done,
         COALESCE(SUM(mcd_pending + returns_pending + amendments_open), 0)::int AS pending,
         COALESCE(SUM(renewals_overdue), 0)::int AS overdue
       FROM crm_compliance_monthly_summary
       WHERE month = $1 AND year = $2
         ${scope.branchId ? 'AND branch_id = $3' : ''}`,
      scope.branchId
        ? [scope.month, scope.year, scope.branchId]
        : [scope.month, scope.year],
      [],
    );

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
      params.push(scope.branchId);
      conditions.push(`a.client_id = (SELECT clientid FROM client_branches WHERE id = $${params.length} LIMIT 1)`);
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
    const enforcementRows = await this.safeMany<EnforcementRow>(
      `SELECT branch_id, event_type, authority, event_date, reference_no, status
       FROM branch_enforcement_events
       ${scope.branchId ? 'WHERE branch_id = $1' : ''}
       ORDER BY event_date DESC
       LIMIT 50`,
      scope.branchId ? [scope.branchId] : [],
      [],
    );

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
