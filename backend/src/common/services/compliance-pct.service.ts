import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Canonical compliance-percentage calculator.
 *
 * All compliance % values across the platform should originate here
 * to avoid the 6+ divergent formulas previously spread across modules.
 *
 * Source table : compliance_tasks
 * Compliant    : status IN ('APPROVED', 'SUBMITTED')
 * Formula      : ROUND(100.0 * compliant / NULLIF(total, 0), 1)
 *
 * Optional frequency weighting (mirroring the branch-compliance service):
 *   Monthly=60%, Quarterly=20%, (Yearly+HalfYearly)=20%
 *   → weights are redistributed proportionally when a bucket has no tasks.
 */

export interface BranchPctRow {
  branchId: string;
  branchName: string;
  stateCode: string;
  total: number;
  approved: number;
  submitted: number;
  pending: number;
  overdue: number;
  compliancePct: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PctSummary {
  total: number;
  compliant: number;
  pending: number;
  overdue: number;
  compliancePct: number;
}

@Injectable()
export class CompliancePctService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /* ───────── single-branch ───────── */

  async branchPct(branchId: string, month?: string): Promise<PctSummary> {
    const monthFilter = month ? `AND to_char(ct.due_date, 'YYYY-MM') = $2` : '';
    const params: any[] = [branchId];
    if (month) params.push(month);

    const sql = `
      SELECT
        COUNT(*)::int                                            AS total,
        COUNT(*) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED'))::int AS compliant,
        COUNT(*) FILTER (WHERE ct.status = 'PENDING')::int       AS pending,
        COUNT(*) FILTER (WHERE ct.status = 'OVERDUE' OR (ct.due_date < NOW() AND ct.status NOT IN ('APPROVED','SUBMITTED')))::int AS overdue,
        ROUND(
          CASE WHEN COUNT(*) > 0
            THEN 100.0 * COUNT(*) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED')) / COUNT(*)
            ELSE 0
          END, 1
        )::float AS "compliancePct"
      FROM compliance_tasks ct
      WHERE ct.branch_id = $1
        ${monthFilter}
    `;

    const rows = await this.ds.query(sql, params);
    const r = rows[0] || {};
    return {
      total: r.total ?? 0,
      compliant: r.compliant ?? 0,
      pending: r.pending ?? 0,
      overdue: r.overdue ?? 0,
      compliancePct: r.compliancePct ?? 0,
    };
  }

  /* ───────── all branches for a client ───────── */

  async clientBranchesPct(
    clientId: string,
    month?: string,
  ): Promise<BranchPctRow[]> {
    const monthFilter = month ? `AND to_char(ct.due_date, 'YYYY-MM') = $2` : '';
    const params: any[] = [clientId];
    if (month) params.push(month);

    const sql = `
      SELECT
        b.id                                                       AS "branchId",
        b.branchname                                               AS "branchName",
        b.statecode                                                AS "stateCode",
        COUNT(ct.id)::int                                          AS total,
        COUNT(ct.id) FILTER (WHERE ct.status = 'APPROVED')::int    AS approved,
        COUNT(ct.id) FILTER (WHERE ct.status = 'SUBMITTED')::int   AS submitted,
        COUNT(ct.id) FILTER (WHERE ct.status = 'PENDING')::int     AS pending,
        COUNT(ct.id) FILTER (WHERE ct.status = 'OVERDUE'
          OR (ct.due_date < NOW() AND ct.status NOT IN ('APPROVED','SUBMITTED')))::int AS overdue,
        ROUND(
          CASE WHEN COUNT(ct.id) > 0
            THEN 100.0 * COUNT(ct.id) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED'))
                       / COUNT(ct.id)
            ELSE 0
          END, 1
        )::float AS "compliancePct"
      FROM client_branches b
      LEFT JOIN compliance_tasks ct ON ct.branch_id = b.id AND ct.client_id = $1
        ${monthFilter}
      WHERE b.clientid = $1
        AND (b.status IS NULL OR b.status = 'ACTIVE')
      GROUP BY b.id, b.branchname, b.statecode
      ORDER BY "compliancePct" ASC
    `;

    const rows: any[] = await this.ds.query(sql, params);
    return rows.map((r) => ({
      ...r,
      riskLevel: this.computeRisk(r.compliancePct, r.overdue),
    }));
  }

  /* ───────── overall client pct ───────── */

  async clientOverallPct(
    clientId: string,
    month?: string,
  ): Promise<PctSummary> {
    const monthFilter = month ? `AND to_char(ct.due_date, 'YYYY-MM') = $2` : '';
    const params: any[] = [clientId];
    if (month) params.push(month);

    const sql = `
      SELECT
        COUNT(*)::int                                            AS total,
        COUNT(*) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED'))::int AS compliant,
        COUNT(*) FILTER (WHERE ct.status = 'PENDING')::int       AS pending,
        COUNT(*) FILTER (WHERE ct.status = 'OVERDUE'
          OR (ct.due_date < NOW() AND ct.status NOT IN ('APPROVED','SUBMITTED')))::int AS overdue,
        ROUND(
          CASE WHEN COUNT(*) > 0
            THEN 100.0 * COUNT(*) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED')) / COUNT(*)
            ELSE 0
          END, 1
        )::float AS "compliancePct"
      FROM compliance_tasks ct
      WHERE ct.client_id = $1
        ${monthFilter}
    `;

    const rows = await this.ds.query(sql, params);
    const r = rows[0] || {};
    return {
      total: r.total ?? 0,
      compliant: r.compliant ?? 0,
      pending: r.pending ?? 0,
      overdue: r.overdue ?? 0,
      compliancePct: r.compliancePct ?? 0,
    };
  }

  /* ───────── weighted compliance (Monthly 60% / Quarterly 20% / Annual 20%) ───────── */

  async branchWeightedPct(branchId: string, month?: string): Promise<number> {
    const monthFilter = month ? `AND to_char(ct.due_date, 'YYYY-MM') = $2` : '';
    const params: any[] = [branchId];
    if (month) params.push(month);

    const sql = `
      SELECT
        ct.frequency,
        COUNT(*)::int                                            AS total,
        COUNT(*) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED'))::int AS compliant
      FROM compliance_tasks ct
      WHERE ct.branch_id = $1
        ${monthFilter}
      GROUP BY ct.frequency
    `;

    const rows: any[] = await this.ds.query(sql, params);

    // Build frequency buckets
    const buckets: Record<string, { total: number; compliant: number }> = {};
    for (const r of rows) {
      const freq = (r.frequency || 'MONTHLY').toUpperCase();
      buckets[freq] = { total: r.total, compliant: r.compliant };
    }

    // Default weights
    const weights: Record<string, number> = {
      MONTHLY: 0.6,
      QUARTERLY: 0.2,
      ANNUAL: 0.1,
      YEARLY: 0.1,
      HALF_YEARLY: 0.1,
    };

    // Calculate or redistribute
    let totalWeight = 0;
    let weightedSum = 0;
    const emptyKeys: string[] = [];

    for (const [key, w] of Object.entries(weights)) {
      const b = buckets[key];
      if (b && b.total > 0) {
        weightedSum += (b.compliant / b.total) * 100 * w;
        totalWeight += w;
      } else {
        emptyKeys.push(key);
      }
    }

    if (totalWeight === 0) return 0;

    // Redistribute empty weights proportionally
    const pct =
      (weightedSum / totalWeight) * (totalWeight + emptyKeys.length * 0);
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }

  /* ───────── lowest branches (for dashboards) ───────── */

  async lowestBranches(
    clientId: string,
    month?: string,
    limit = 5,
  ): Promise<BranchPctRow[]> {
    const all = await this.clientBranchesPct(clientId, month);
    return all.slice(0, limit);
  }

  /* ───────── risk classification ───────── */

  private computeRisk(
    pct: number,
    overdue: number,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (pct < 50 || overdue >= 10) return 'CRITICAL';
    if (pct < 70 || overdue >= 5) return 'HIGH';
    if (pct < 85 || overdue >= 2) return 'MEDIUM';
    return 'LOW';
  }
}
