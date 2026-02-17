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

  /**
   * Get high-level executive summary KPIs
   */
  async getSummary(query: any) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM clients WHERE is_active = true AND is_deleted = false) AS total_clients,
        (SELECT COUNT(*) FROM branches b WHERE b.is_active = true AND b.deleted_at IS NULL) AS total_branches,
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
  async getClientOverview(query: any) {
    const limit = parseInt(query.limit) || 100;
    const offset = parseInt(query.offset) || 0;
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
        (SELECT COUNT(*) FROM branches b WHERE b.client_id = c.id AND b.is_active = true AND b.deleted_at IS NULL) as branch_count,
        (SELECT COUNT(*) FROM branch_compliances bc
         JOIN branches b ON bc.branch_id = b.id
         WHERE b.client_id = c.id AND bc.status = 'OVERDUE') as overdue_count,
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
  async getCcoCrmPerformance(query: any) {
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
        LEFT JOIN branches b ON b.client_id = c.id AND b.is_active = true AND b.deleted_at IS NULL
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
  async getGovernanceCompliance(query: any) {
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
  async getRecentEscalations(query: any) {
    const limit = parseInt(query.limit) || 50;
    const offset = parseInt(query.offset) || 0;
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
}
