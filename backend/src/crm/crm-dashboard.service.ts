import { Injectable, BadRequestException } from '@nestjs/common';
import { DbService } from '../common/db/db.service';
import { normalizeDateFilters, normalizePaging } from '../common/utils/filters';
import { CRM_DUE_TAB, CrmDueTab } from '../common/utils/enums';
import {
  CRM_SUMMARY_SQL,
  CRM_DUE_COMPLIANCES_SQL,
  CRM_LOW_COVERAGE_BRANCHES_SQL,
  CRM_QUERIES_SQL,
  CRM_DASHBOARD_KPI_SQL,
  CRM_PRIORITY_TODAY_SQL,
  CRM_TOP_RISK_CLIENTS_SQL,
  CRM_UPCOMING_AUDITS_SQL,
} from './sql/crm-dashboard.sql';

export interface CrmSummaryDto {
  assigned_clients_count: number;
  assigned_branches_count: number;
  compliance_coverage_pct: number | null;
  overdue_compliances_count: number;
  due_soon_compliances_count: number;
  open_compliance_queries_count: number;
}

export interface CrmComplianceItemDto {
  schedule_id: string;
  client_id: string;
  client_name: string;
  branch_id: string;
  branch_name: string;
  category: string;
  compliance_item: string;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  due_date: Date;
  days_overdue: number;
  status: string;
}

export interface CrmLowCoverageBranchDto {
  client_id: string;
  client_name: string;
  branch_id: string;
  branch_name: string;
  coverage_pct: number | null;
  overdue_count: number;
  high_risk_pending: number;
}

export interface CrmQueryDto {
  query_id: string;
  from_role: string;
  from_name: string;
  client_id: string;
  client_name: string;
  branch_id: string;
  branch_name: string;
  subject: string;
  ageing_days: number;
  status: string;
  created_at: Date;
}

/**
 * CRM Dashboard Service
 * Executes raw SQL queries with USER SCOPING enforced
 * ⚠️ CRITICAL: crmUserId must always come from JWT token, never from query params
 */
@Injectable()
export class CrmDashboardService {
  constructor(private readonly db: DbService) {}

  /**
   * Get CRM dashboard summary KPIs
   * Scoped to clients assigned to the CRM user
   */
  async getSummary(crmUserId: string, query: any): Promise<CrmSummaryDto> {
    const f = normalizeDateFilters(query);

    return this.db.one<CrmSummaryDto>(CRM_SUMMARY_SQL, [
      crmUserId,
      f.clientId,
      f.fromDate,
      f.toDate,
      f.windowDays,
    ]);
  }

  /**
   * Get compliance items by tab (OVERDUE, DUE_SOON, THIS_MONTH)
   * Scoped to CRM's assigned clients
   */
  async getDueCompliances(
    crmUserId: string,
    query: any,
  ): Promise<CrmComplianceItemDto[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    const tab = String(query.tab ?? 'OVERDUE').toUpperCase() as CrmDueTab;
    if (!CRM_DUE_TAB.includes(tab)) {
      throw new BadRequestException(
        `Invalid tab. Use ${CRM_DUE_TAB.join(', ')}`,
      );
    }

    return this.db.many<CrmComplianceItemDto>(CRM_DUE_COMPLIANCES_SQL, [
      crmUserId,
      f.clientId,
      f.branchId,
      f.fromDate,
      f.toDate,
      tab,
      f.windowDays,
      p.limit,
      p.offset,
    ]);
  }

  /**
   * Get branches with low compliance coverage (<70% or >=5 overdue)
   * Scoped to CRM's assigned clients
   */
  async getLowCoverageBranches(
    crmUserId: string,
    query: any,
  ): Promise<CrmLowCoverageBranchDto[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    return this.db.many<CrmLowCoverageBranchDto>(
      CRM_LOW_COVERAGE_BRANCHES_SQL,
      [crmUserId, f.clientId, f.fromDate, f.toDate, p.limit, p.offset],
    );
  }

  /**
   * Get compliance queries inbox
   * Scoped to CRM user
   */
  async getQueries(crmUserId: string, query: any): Promise<CrmQueryDto[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    const status = query.status ? String(query.status).toUpperCase() : null; // UNREAD/READ/CLOSED

    return this.db.many<CrmQueryDto>(CRM_QUERIES_SQL, [
      crmUserId,
      status,
      f.clientId,
      f.fromDate,
      f.toDate,
      p.limit,
      p.offset,
    ]);
  }

  /**
   * Get pending documents from contractors
   * Returns contractor documents awaiting upload/review
   * Scoped to CRM user's assigned clients
   */
  async getPendingDocuments(crmUserId: string, query: any): Promise<any[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    try {
      return await this.db.many(
        `SELECT
           cd.id,
           cd.doc_type       AS "docType",
           cd.doc_month      AS "docMonth",
           cd.status,
           cd.created_at     AS "uploadedAt",
           cd.branch_id      AS "branchId",
           b.branch_name     AS "branchName",
           c.id              AS "clientId",
           c.client_name     AS "clientName"
         FROM contractor_documents cd
         INNER JOIN branches b ON b.id = cd.branch_id
         INNER JOIN clients c ON c.id = b.client_id
         INNER JOIN client_assignments_current cac
           ON cac.client_id = c.id
           AND cac.assigned_to_user_id = $1
           AND cac.assignment_type = 'CRM'
         WHERE cd.status IN ('UPLOADED', 'PENDING_REVIEW')
           AND ($2::uuid IS NULL OR c.id = $2)
         ORDER BY cd.created_at DESC
         LIMIT $3 OFFSET $4`,
        [crmUserId, f.clientId, p.limit, p.offset],
      );
    } catch {
      return [];
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     V2 Dashboard methods (redesigned)
     ═══════════════════════════════════════════════════════════════ */

  /** 8 KPI cards for the redesigned CRM dashboard */
  async getKpis(crmUserId: string): Promise<any> {
    return this.db.one(CRM_DASHBOARD_KPI_SQL, [crmUserId]);
  }

  /** Priority Today — top urgent items across all clients */
  async getPriorityToday(crmUserId: string, limit = 20): Promise<any[]> {
    return this.db.many(CRM_PRIORITY_TODAY_SQL, [crmUserId, limit]);
  }

  /** Top Risk Clients — ranked by compliance % ascending */
  async getTopRiskClients(crmUserId: string, limit = 10): Promise<any[]> {
    return this.db.many(CRM_TOP_RISK_CLIENTS_SQL, [crmUserId, limit]);
  }

  /** Upcoming Audits — scheduled within N days */
  async getUpcomingAudits(crmUserId: string, days = 15): Promise<any[]> {
    return this.db.many(CRM_UPCOMING_AUDITS_SQL, [crmUserId, days]);
  }
}
