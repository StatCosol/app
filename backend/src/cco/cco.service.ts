import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CcoService {
  constructor(private readonly dataSource: DataSource) {}

  // --- Real DB query for CRMs under this CCO ---
  async getCrmsUnderMe(user: any) {
    const ccoId = user.userId ?? user.id;

    const rows = await this.dataSource.query(
      `SELECT
         u.id,
         u.name,
         u.is_active        AS "isActive",
         u.email,
         COALESCE(cc.client_count, 0)::int AS "clientCount",
         COALESCE(ov.overdue_count, 0)::int AS "overdueCount"
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.code = 'CRM'
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS client_count
         FROM clients c
         WHERE c.assigned_crm_id = u.id
           AND (c.is_active = true OR c.is_active IS NULL)
           AND (c.is_deleted = false OR c.is_deleted IS NULL)
       ) cc ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS overdue_count
         FROM compliance_tasks ct
         INNER JOIN clients cl ON cl.id = ct.client_id AND cl.assigned_crm_id = u.id
         WHERE ct.status = 'OVERDUE'
       ) ov ON true
       WHERE u.owner_cco_id = $1
         AND u.deleted_at IS NULL
       ORDER BY u.name ASC`,
      [ccoId],
    );

    return rows.map((r: any) => ({
      name: r.name,
      email: r.email,
      status: r.isActive ? 'ACTIVE' : 'INACTIVE',
      clientCount: r.clientCount,
      overdueCount: r.overdueCount,
      lastLogin: '',
    }));
  }

  // --- Real DB query for pending deletion requests assigned to this CCO ---
  async getApprovals(user: any) {
    const ccoId = user.userId ?? user.id;

    const rows = await this.dataSource.query(
      `SELECT
         dr.id,
         dr.entity_type     AS "entityType",
         dr.entity_id       AS "entityId",
         dr.status,
         dr.remarks,
         dr.created_at      AS "requestedAt",
         requester.name     AS "requestedBy",
         CASE
           WHEN dr.entity_type = 'USER' THEN target_user.name
           ELSE NULL
         END AS "crmName",
         CASE
           WHEN dr.entity_type = 'USER' THEN REGEXP_REPLACE(target_user.email, '#deleted#\\\\d*', '', 'g')
           ELSE NULL
         END AS "email"
       FROM deletion_requests dr
       LEFT JOIN users requester   ON requester.id = dr.requested_by_user_id
       LEFT JOIN users target_user ON dr.entity_type = 'USER' AND target_user.id = dr.entity_id
       WHERE (
           dr.required_approver_user_id = $1
           OR (dr.required_approver_user_id IS NULL AND dr.required_approver_role = 'CCO')
         )
       ORDER BY dr.created_at DESC`,
      [ccoId],
    );

    return rows.map((r: any) => ({
      id: r.id,
      crmName: r.crmName ?? r.entityType,
      email: r.email ?? '',
      requestedBy: r.requestedBy ?? 'Unknown',
      requestedAt: r.requestedAt,
      reason: r.remarks ?? '',
      status: r.status,
    }));
  }

  // --- Real approve: update deletion_request status ---
  async approveRequest(user: any, id: number) {
    const ccoId = user.userId ?? user.id;

    const [request] = await this.dataSource.query(
      `SELECT id, status FROM deletion_requests
       WHERE id = $1
         AND status = 'PENDING'
         AND (required_approver_user_id = $2
              OR (required_approver_user_id IS NULL AND required_approver_role = 'CCO'))`,
      [id, ccoId],
    );
    if (!request)
      throw new NotFoundException(
        'Approval request not found or already processed',
      );

    // Actually soft-delete the target user
    const [reqDetail] = await this.dataSource.query(
      `SELECT entity_type, entity_id FROM deletion_requests WHERE id = $1`,
      [id],
    );
    if (reqDetail?.entity_type === 'USER') {
      const timestamp = Date.now();
      await this.dataSource.query(
        `UPDATE users SET is_active = false, deleted_at = NOW(), email = email || '#deleted#' || $2, mobile = NULL WHERE id = $1`,
        [reqDetail.entity_id, String(timestamp)],
      );
      await this.dataSource.query(
        `DELETE FROM user_branches WHERE user_id = $1`,
        [reqDetail.entity_id],
      );
    }

    await this.dataSource.query(
      `UPDATE deletion_requests SET status = 'APPROVED', remarks = 'Approved by CCO', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return { success: true, id, status: 'APPROVED' };
  }

  // --- Real reject: update deletion_request status with remarks ---
  async rejectRequest(user: any, id: number, remarks: string) {
    const ccoId = user.userId ?? user.id;

    const [request] = await this.dataSource.query(
      `SELECT id, status FROM deletion_requests
       WHERE id = $1
         AND status = 'PENDING'
         AND (required_approver_user_id = $2
              OR (required_approver_user_id IS NULL AND required_approver_role = 'CCO'))`,
      [id, ccoId],
    );
    if (!request)
      throw new NotFoundException(
        'Approval request not found or already processed',
      );

    if (!remarks || !remarks.trim())
      throw new BadRequestException('Remarks are required when rejecting');

    await this.dataSource.query(
      `UPDATE deletion_requests SET status = 'REJECTED', remarks = $2, updated_at = NOW() WHERE id = $1`,
      [id, remarks.trim()],
    );
    return { success: true, id, status: 'REJECTED' };
  }

  /**
   * Return escalated compliance tasks visible to this CCO.
   * Joins client + branch names so the frontend can display human-readable info.
   */
  async getOversight(user: any, filters?: { status?: string }) {
    const ccoId = user.userId ?? user.id;
    const status = filters?.status ? String(filters.status).toUpperCase() : null;

    const rows = await this.dataSource.query(
      `
      SELECT
        ct.id,
        ct.client_id      AS "clientId",
        ct.branch_id      AS "branchId",
        c.client_name     AS "client",
        b.branchname      AS "branch",
        ct.due_date       AS "dueDate",
        ct.status,
        ct.escalated_at   AS "escalatedAt",
        ct.remarks        AS "lastActionNote",
        ct.assigned_to_user_id AS "ownerUserId",
        COALESCE(owner_u.name, '-') AS "ownerName",
        crm.id            AS "crmId",
        COALESCE(crm.name, '-') AS "crmName",
        GREATEST(0, (CURRENT_DATE - ct.due_date))::int AS "ageDays"
      FROM compliance_tasks ct
      INNER JOIN clients c ON c.id = ct.client_id
      INNER JOIN users crm ON crm.id = c.assigned_crm_id
      LEFT JOIN users owner_u ON owner_u.id = ct.assigned_to_user_id
      LEFT JOIN client_branches b ON b.id = ct.branch_id
      WHERE ct.escalated_at IS NOT NULL
        AND crm.owner_cco_id = $1
        AND ($2::text IS NULL OR ct.status = $2)
      ORDER BY ct.escalated_at DESC
      LIMIT 300
    `,
      [ccoId, status],
    );
    return rows;
  }

  /**
   * Return repeated client/branch delay patterns for this CCO's CRM portfolio.
   */
  async getOversightDelays(user: any) {
    const ccoId = user.userId ?? user.id;
    return this.dataSource.query(
      `
      SELECT
        c.id                AS "clientId",
        b.id                AS "branchId",
        c.client_name       AS "client",
        COALESCE(b.branchname, '-') AS "branch",
        crm.id              AS "crmId",
        COALESCE(crm.name, '-') AS "crmName",
        COUNT(*)::int       AS "repeatedCount",
        COUNT(CASE WHEN ct.status IN ('OVERDUE', 'PENDING', 'IN_PROGRESS') THEN 1 END)::int AS "openCount",
        MAX(ct.escalated_at) AS "latestEscalation",
        ROUND(AVG(GREATEST(0, (CURRENT_DATE - ct.due_date)))::numeric, 1) AS "avgDelayDays"
      FROM compliance_tasks ct
      INNER JOIN clients c ON c.id = ct.client_id
      INNER JOIN users crm ON crm.id = c.assigned_crm_id
      LEFT JOIN client_branches b ON b.id = ct.branch_id
      WHERE ct.escalated_at IS NOT NULL
        AND crm.owner_cco_id = $1
      GROUP BY c.id, b.id, c.client_name, b.branchname, crm.id, crm.name
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC, MAX(ct.escalated_at) DESC
      LIMIT 100
    `,
      [ccoId],
    );
  }

  /**
   * Monthly trend for oversight visibility.
   */
  async getOversightTrends(user: any, months = 6) {
    const ccoId = user.userId ?? user.id;
    const safeMonths = Math.max(3, Math.min(Number(months) || 6, 24));
    return this.dataSource.query(
      `
      WITH month_series AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - ($2 - 1) * INTERVAL '1 month',
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) AS month_start
      ),
      scoped_tasks AS (
        SELECT
          ct.*,
          date_trunc('month', COALESCE(ct.escalated_at, ct.updated_at, ct.created_at)) AS month_start
        FROM compliance_tasks ct
        INNER JOIN clients c ON c.id = ct.client_id
        INNER JOIN users crm ON crm.id = c.assigned_crm_id
        WHERE crm.owner_cco_id = $1
          AND COALESCE(ct.escalated_at, ct.updated_at, ct.created_at) >=
              date_trunc('month', CURRENT_DATE) - ($2 - 1) * INTERVAL '1 month'
      )
      SELECT
        to_char(ms.month_start, 'YYYY-MM') AS month,
        COALESCE(COUNT(st.id), 0)::int AS "totalTouched",
        COALESCE(COUNT(CASE WHEN st.escalated_at IS NOT NULL THEN 1 END), 0)::int AS "escalatedCount",
        COALESCE(COUNT(CASE WHEN st.status = 'OVERDUE' THEN 1 END), 0)::int AS "overdueCount",
        COALESCE(COUNT(CASE WHEN st.status IN ('APPROVED', 'COMPLETED') THEN 1 END), 0)::int AS "closedCount"
      FROM month_series ms
      LEFT JOIN scoped_tasks st ON st.month_start = ms.month_start
      GROUP BY ms.month_start
      ORDER BY ms.month_start ASC
    `,
      [ccoId, safeMonths],
    );
  }

  // --- Real DB-backed dashboard ---
  async getDashboard(user: any) {
    const ccoId = user.userId ?? user.id;

    // 1. Count CRMs under this CCO
    const [crmRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id AND r.code = 'CRM'
       WHERE u.owner_cco_id = $1 AND u.deleted_at IS NULL`,
      [ccoId],
    );
    const totalCrms = crmRow?.n ?? 0;

    // 2. Count pending deletion approvals assigned to this CCO
    const [approvalRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n
       FROM deletion_requests
       WHERE status = 'PENDING'
         AND (required_approver_user_id = $1
              OR (required_approver_user_id IS NULL AND required_approver_role = 'CCO'))`,
      [ccoId],
    );
    const pendingApprovals = approvalRow?.n ?? 0;

    // 3. Count overdue compliance tasks for clients assigned to CRMs under this CCO
    const [overdueRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n
       FROM compliance_tasks ct
       INNER JOIN clients cl ON cl.id = ct.client_id
       INNER JOIN users crm ON crm.id = cl.assigned_crm_id
         AND crm.owner_cco_id = $1 AND crm.deleted_at IS NULL
       WHERE ct.status = 'OVERDUE'`,
      [ccoId],
    );
    const overdueTasks = overdueRow?.n ?? 0;

    // 4. Count escalated tasks
    const [escalationRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n
       FROM compliance_tasks ct
       INNER JOIN clients cl ON cl.id = ct.client_id
       INNER JOIN users crm ON crm.id = cl.assigned_crm_id
         AND crm.owner_cco_id = $1 AND crm.deleted_at IS NULL
       WHERE ct.escalated_at IS NOT NULL`,
      [ccoId],
    );
    const escalations = escalationRow?.n ?? 0;

    // 5. Top overdue clients/branches (top 5)
    const topOverdue = await this.dataSource.query(
      `SELECT
         cl.client_name AS "client",
         b.branchname   AS "branch",
         COUNT(*)::int  AS "count"
       FROM compliance_tasks ct
       INNER JOIN clients  cl  ON cl.id = ct.client_id
       INNER JOIN users    crm ON crm.id = cl.assigned_crm_id
         AND crm.owner_cco_id = $1 AND crm.deleted_at IS NULL
       LEFT  JOIN client_branches b   ON b.id = ct.branch_id
       WHERE ct.status = 'OVERDUE'
       GROUP BY cl.client_name, b.branchname
       ORDER BY COUNT(*) DESC
       LIMIT 5`,
      [ccoId],
    );

    // 6. CRMs with most overdue tasks (top 5)
    const crmsMostOverdue = await this.dataSource.query(
      `SELECT
         crm.name          AS "crm",
         COUNT(*)::int     AS "overdue"
       FROM compliance_tasks ct
       INNER JOIN clients cl  ON cl.id = ct.client_id
       INNER JOIN users   crm ON crm.id = cl.assigned_crm_id
         AND crm.owner_cco_id = $1 AND crm.deleted_at IS NULL
       WHERE ct.status = 'OVERDUE'
       GROUP BY crm.name
       ORDER BY COUNT(*) DESC
       LIMIT 5`,
      [ccoId],
    );

    return {
      pendingApprovals,
      totalCrms,
      overdueTasks,
      escalations,
      topOverdue,
      crmsMostOverdue,
    };
  }
}
