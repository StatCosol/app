import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface BranchRiskItem {
  branchId: string;
  branchName: string;
  stateCode: string | null;
  city: string | null;
  riskScore: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private readonly ds: DataSource) {}

  /**
   * Calculate risk score for a single branch in a given month.
   * Risk formula: weighted assessment of expired registrations,
   * overdue SLA tasks, and compliance gaps.
   */
  async calculateBranchRisk(branchId: string, month: string): Promise<number> {
    const [year, mon] = month.split('-').map(Number);
    const monthEnd = new Date(year, mon, 0, 23, 59, 59, 999);

    // 1) Expired registrations (weight 40%)
    const expiredRows = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt
       FROM branch_registrations
       WHERE branch_id = $1
         AND status <> 'DELETED'
         AND expiry_date IS NOT NULL
         AND expiry_date < $2`,
      [branchId, monthEnd],
    ) as { cnt: number }[];
    const expiredCount = expiredRows[0]?.cnt || 0;

    // 2) Overdue SLA tasks (weight 35%)
    const overdueRows = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt
       FROM sla_tasks
       WHERE branch_id = $1
         AND deleted_at IS NULL
         AND status <> 'CLOSED'
         AND due_date < $2`,
      [branchId, monthEnd],
    ) as { cnt: number }[];
    const overdueCount = overdueRows[0]?.cnt || 0;

    // 3) Total registrations to compute ratio (weight 25%)
    const totalRegRows = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt
       FROM branch_registrations
       WHERE branch_id = $1 AND status <> 'DELETED'`,
      [branchId],
    ) as { cnt: number }[];
    const totalRegs = totalRegRows[0]?.cnt || 1; // avoid div by zero

    // Score calculation (0-100)
    const expiredRatio = Math.min(expiredCount / Math.max(totalRegs, 1), 1);
    const overdueScore = Math.min(overdueCount * 10, 100);
    const score = Math.round(
      expiredRatio * 40 + (overdueScore / 100) * 35 + expiredRatio * 25,
    );

    return Math.min(score, 100);
  }

  /**
   * Get heatmap data: all branches grouped by state with risk scores.
   */
  async getHeatmap(params: {
    clientId: string;
    branchIds: string[];
    month: string;
  }): Promise<{ month: string; branches: BranchRiskItem[] }> {
    const { clientId, branchIds, month } = params;

    let sql = `
      SELECT id, branchname, statecode, city
      FROM client_branches
      WHERE clientid = $1
        AND isdeleted = false
        AND status = 'ACTIVE'
    `;
    const sqlParams: unknown[] = [clientId];

    if (branchIds.length > 0) {
      sqlParams.push(branchIds);
      sql += ` AND id = ANY($${sqlParams.length}::uuid[])`;
    }

    sql += ` ORDER BY statecode, branchname`;

    const rows = await this.ds.query(sql, sqlParams) as { id: string; branchname: string | null; statecode: string | null; city: string | null }[];

    const result: BranchRiskItem[] = [];

    for (const b of rows) {
      const riskScore = await this.calculateBranchRisk(b.id, month);
      result.push({
        branchId: b.id,
        branchName: b.branchname || 'Unnamed Branch',
        stateCode: b.statecode || null,
        city: b.city || null,
        riskScore,
        riskLevel: this.getLevel(riskScore),
      });
    }

    return { month, branches: result };
  }

  /**
   * Get risk trend data for a branch over a date range.
   */
  async getTrend(params: {
    branchId: string;
    from: string;
    to: string;
  }): Promise<{ points: { date: string; riskScore: number }[] }> {
    let rows: { snapshot_date: string | Date; risk_score: number }[] = [];
    try {
      rows = await this.ds.query(
        `SELECT snapshot_date, risk_score
         FROM branch_risk_snapshots
         WHERE branch_id = $1
           AND snapshot_date BETWEEN $2 AND $3
         ORDER BY snapshot_date ASC`,
        [params.branchId, params.from, params.to],
      );
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '42P01') {
        this.logger.warn(
          'branch_risk_snapshots table missing; returning empty risk trend.',
        );
        return { points: [] };
      }
      throw err;
    }

    const points = rows.map((r) => ({
      date:
        typeof r.snapshot_date === 'string'
          ? r.snapshot_date.substring(0, 10)
          : new Date(r.snapshot_date).toISOString().substring(0, 10),
      riskScore: r.risk_score,
    }));

    return { points };
  }

  getLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 75) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }
}
