import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ExpiryTaskService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * List expiry tasks for CRM (all assigned clients).
   */
  async listForCrm(
    crmUserId: string,
    filters?: { status?: string; daysThreshold?: number },
  ): Promise<any[]> {
    let sql = `
      SELECT ret.*, b.branchname AS branch_name, c.client_name AS client_name
      FROM registration_expiry_tasks ret
      JOIN client_branches b ON b.id = ret.branch_id
      JOIN clients c ON c.id = ret.client_id
      JOIN client_assignments cac ON cac.client_id = ret.client_id AND cac.crm_user_id = $1
      WHERE 1=1
    `;
    const params: unknown[] = [crmUserId];
    let idx = 2;

    if (filters?.status) {
      sql += ` AND ret.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters?.daysThreshold) {
      sql += ` AND ret.expiry_date <= NOW() + INTERVAL '1 day' * $${idx++}`;
      params.push(filters.daysThreshold);
    }

    sql += ` ORDER BY ret.expiry_date ASC`;
    return this.dataSource.query(sql, params);
  }

  /**
   * List expiry tasks for a branch user.
   */
  async listForBranch(branchIds: string[]): Promise<any[]> {
    if (!branchIds.length) return [];
    return this.dataSource.query(
      `SELECT ret.*, b.branchname AS branch_name
       FROM registration_expiry_tasks ret
       JOIN client_branches b ON b.id = ret.branch_id
       WHERE ret.branch_id = ANY($1)
       ORDER BY ret.expiry_date ASC`,
      [branchIds],
    );
  }

  /**
   * List expiry tasks for a client.
   */
  async listForClient(clientId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT ret.*, b.branchname AS branch_name
       FROM registration_expiry_tasks ret
       JOIN client_branches b ON b.id = ret.branch_id
       WHERE ret.client_id = $1
       ORDER BY ret.expiry_date ASC`,
      [clientId],
    );
  }

  /**
   * KPI summary: counts by status + upcoming counts.
   */
  async getKpiSummary(clientId?: string, crmUserId?: string): Promise<any> {
    let whereClause = '';
    const params: unknown[] = [];
    if (clientId) {
      whereClause = 'WHERE ret.client_id = $1';
      params.push(clientId);
    } else if (crmUserId) {
      whereClause =
        'WHERE EXISTS (SELECT 1 FROM client_assignments cac WHERE cac.client_id = ret.client_id AND cac.crm_user_id = $1)';
      params.push(crmUserId);
    }

    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ret.status = 'PENDING')::int AS pending,
         COUNT(*) FILTER (WHERE ret.status = 'IN_PROGRESS')::int AS in_progress,
         COUNT(*) FILTER (WHERE ret.status = 'COMPLETED')::int AS completed,
         COUNT(*) FILTER (WHERE ret.status = 'OVERDUE')::int AS overdue,
         COUNT(*) FILTER (WHERE ret.expiry_date <= NOW() + INTERVAL '7 days' AND ret.status NOT IN ('COMPLETED','CANCELLED'))::int AS expiring_7d,
         COUNT(*) FILTER (WHERE ret.expiry_date <= NOW() + INTERVAL '30 days' AND ret.status NOT IN ('COMPLETED','CANCELLED'))::int AS expiring_30d
       FROM registration_expiry_tasks ret
       ${whereClause}`,
      params,
    );
    return (
      rows[0] || {
        total: 0,
        pending: 0,
        in_progress: 0,
        completed: 0,
        overdue: 0,
        expiring_7d: 0,
        expiring_30d: 0,
      }
    );
  }

  /**
   * Update an expiry task status.
   */
  async updateStatus(
    taskId: string,
    status: string,
    notes?: string,
  ): Promise<any> {
    const completedAt = status === 'COMPLETED' ? 'NOW()' : 'NULL';
    await this.dataSource.query(
      `UPDATE registration_expiry_tasks
       SET status = $1, notes = COALESCE($2, notes), updated_at = NOW(),
           completed_at = ${completedAt}
       WHERE id = $3`,
      [status, notes || null, taskId],
    );
    return { id: taskId, status };
  }
}
