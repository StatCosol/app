import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ClientReturnsVisibilityService {
  constructor(private readonly dataSource: DataSource) {}

  /** Return tasks for a client (optionally filtered by branch) */
  async getReturns(clientId: string, branchId?: string) {
    let sql = `
      SELECT cr.id, cr.law_type, cr.return_type, cr.period_year, cr.period_month,
             cr.period_label, cr.due_date, cr.filed_date, cr.status,
             cr.ack_number, cr.ack_file_path, cr.challan_file_path,
             cr.crm_last_note AS crm_remarks,
             b.branchname AS branch_name, b.id AS branch_id
      FROM compliance_returns cr
      JOIN client_branches b ON b.id = cr.branch_id
      WHERE cr.client_id = $1 AND cr.is_deleted = false
    `;
    const params: unknown[] = [clientId];
    if (branchId) {
      sql += ` AND cr.branch_id = $2`;
      params.push(branchId);
    }
    sql += ` ORDER BY cr.due_date DESC`;
    return this.dataSource.query(sql, params);
  }

  /** Expiry / renewal tasks for a client */
  async getExpiry(clientId: string, branchId?: string) {
    let sql = `
      SELECT ret.id, ret.registration_name, ret.expiry_date,
             ret.days_before_expiry, ret.status, ret.notes AS remarks,
             ret.renewal_date AS renewed_till, ret.branch_id,
             b.branchname AS branch_name
      FROM registration_expiry_tasks ret
      JOIN client_branches b ON b.id = ret.branch_id
      WHERE ret.client_id = $1
    `;
    const params: unknown[] = [clientId];
    if (branchId) {
      sql += ` AND ret.branch_id = $2`;
      params.push(branchId);
    }
    sql += ` ORDER BY ret.expiry_date ASC`;
    return this.dataSource.query(sql, params);
  }

  /** Aggregated compliance summary */
  async getComplianceSummary(clientId: string, branchId?: string) {
    const branchFilter = branchId ? 'AND cr.branch_id = $2' : '';
    const branchFilterExp = branchId ? 'AND ret.branch_id = $2' : '';
    const params: unknown[] = branchId ? [clientId, branchId] : [clientId];

    const returnRows = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_returns,
         COUNT(*) FILTER (WHERE cr.status = 'APPROVED')::int AS verified_returns,
         COUNT(*) FILTER (WHERE cr.status = 'SUBMITTED' AND cr.ack_file_path IS NULL)::int AS filed_pending_proof,
         COUNT(*) FILTER (WHERE cr.due_date < NOW() AND cr.status NOT IN ('APPROVED','NOT_APPLICABLE'))::int AS overdue_returns
       FROM compliance_returns cr
       WHERE cr.client_id = $1 AND cr.is_deleted = false ${branchFilter}`,
      params,
    );

    const expiryRows = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_renewals,
         COUNT(*) FILTER (WHERE ret.status = 'COMPLETED')::int AS verified_renewals,
         COUNT(*) FILTER (WHERE ret.expiry_date < NOW() AND ret.status NOT IN ('COMPLETED','CANCELLED'))::int AS overdue_renewals
       FROM registration_expiry_tasks ret
       WHERE ret.client_id = $1 ${branchFilterExp}`,
      params,
    );

    // Due in 7 days across both returns and expiry
    const dueReturns = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cnt
       FROM compliance_returns cr
       WHERE cr.client_id = $1 AND cr.is_deleted = false
         AND cr.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         AND cr.status NOT IN ('APPROVED','NOT_APPLICABLE')
         ${branchFilter}`,
      params,
    );
    const dueExpiry = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cnt
       FROM registration_expiry_tasks ret
       WHERE ret.client_id = $1
         AND ret.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         AND ret.status NOT IN ('COMPLETED','CANCELLED')
         ${branchFilterExp}`,
      params,
    );

    const r = returnRows[0] || {};
    const e = expiryRows[0] || {};

    return {
      totalReturns: r.total_returns ?? 0,
      verifiedReturns: r.verified_returns ?? 0,
      filedPendingProof: r.filed_pending_proof ?? 0,
      overdueReturns: r.overdue_returns ?? 0,
      totalRenewals: e.total_renewals ?? 0,
      verifiedRenewals: e.verified_renewals ?? 0,
      overdueRenewals: e.overdue_renewals ?? 0,
      upcomingDueIn7Days: (dueReturns[0]?.cnt ?? 0) + (dueExpiry[0]?.cnt ?? 0),
    };
  }

  /** Compliance calendar feed: returns + expiry items sorted by date */
  async getCalendar(clientId: string, branchId?: string) {
    const branchFilter = branchId ? 'AND cr.branch_id = $2' : '';
    const branchFilterExp = branchId ? 'AND ret.branch_id = $2' : '';
    const params: unknown[] = branchId ? [clientId, branchId] : [clientId];

    const returns = await this.dataSource.query(
      `SELECT cr.id, cr.return_type AS title, cr.due_date,
              cr.status, cr.law_type AS sub_label,
              b.branchname AS branch_name, b.id AS branch_id,
              CASE WHEN cr.status = 'SUBMITTED' AND cr.ack_file_path IS NULL THEN true ELSE false END AS proof_pending
       FROM compliance_returns cr
       JOIN client_branches b ON b.id = cr.branch_id
       WHERE cr.client_id = $1 AND cr.is_deleted = false ${branchFilter}
       ORDER BY cr.due_date`,
      params,
    );

    const expiry = await this.dataSource.query(
      `SELECT ret.id, ret.registration_name AS title, ret.expiry_date AS due_date,
              ret.status, 'RENEWAL' AS sub_label,
              b.branchname AS branch_name, b.id AS branch_id,
              false AS proof_pending
       FROM registration_expiry_tasks ret
       JOIN client_branches b ON b.id = ret.branch_id
       WHERE ret.client_id = $1 ${branchFilterExp}
       ORDER BY ret.expiry_date`,
      params,
    );

    const returnItems = returns.map((r: any) => ({
      id: r.id,
      itemType: 'RETURN' as const,
      title: r.title,
      clientId,
      branchId: r.branch_id,
      dueDate: r.due_date,
      status: r.status,
      subLabel: r.sub_label,
      proofPending: r.proof_pending,
    }));

    const expiryItems = expiry.map((r: any) => ({
      id: r.id,
      itemType: 'RENEWAL' as const,
      title: r.title,
      clientId,
      branchId: r.branch_id,
      dueDate: r.due_date,
      status: r.status,
      subLabel: r.sub_label,
      proofPending: r.proof_pending,
    }));

    return [...returnItems, ...expiryItems].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }

  /** Compliance reminders: overdue + proof-pending + due in 7 days */
  async getReminders(clientId: string, branchId?: string) {
    const calendar = await this.getCalendar(clientId, branchId);
    const today = new Date();

    return calendar
      .filter((item) => {
        const dt = new Date(item.dueDate);
        const diff = Math.ceil(
          (dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return diff <= 7 || item.status === 'OVERDUE' || item.proofPending;
      })
      .map((item) => ({
        id: item.id,
        module:
          item.itemType === 'RETURN'
            ? ('RETURNS' as const)
            : ('RENEWALS' as const),
        title: item.title,
        message:
          item.status === 'OVERDUE'
            ? `${item.title} is overdue`
            : item.proofPending
              ? `${item.title} is pending proof submission`
              : `${item.title} is due on ${item.dueDate}`,
        dueDate: item.dueDate,
        priority:
          item.status === 'OVERDUE'
            ? ('CRITICAL' as const)
            : item.proofPending
              ? ('HIGH' as const)
              : ('MEDIUM' as const),
        status: 'OPEN' as const,
        entityId: item.id,
        entityType:
          item.itemType === 'RETURN'
            ? ('RETURN_TASK' as const)
            : ('EXPIRY_TASK' as const),
      }));
  }
}
