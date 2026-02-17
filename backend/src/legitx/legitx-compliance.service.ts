import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../common/db/db.service';

export interface ComplianceStatusSummary {
  overallCompliancePercent: number;
  branchesCompliant: number;
  pendingItems: number;
  overdueItems: number;
  criticalItems: number;
}

export interface BranchComplianceRow {
  branchId: string | null;
  branchName: string;
  mcdStatus: string;
  returnsStatus: string;
  renewalsDue: number;
  amendmentsOpen: number;
  auditStatus: string;
  compliancePercent: number;
}

export interface McdRow {
  id: string;
  branchId: string | null;
  branchName: string;
  establishmentType: string | null;
  state: string | null;
  month: number;
  year: number;
  status: string;
  submittedDate: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  downloadUrl?: string | null;
}

export interface ReturnRow {
  id: string;
  branchId: string | null;
  branchName: string;
  lawType: string;
  periodLabel: string;
  dueDate: string | null;
  status: string;
  filedDate: string | null;
  filedBy: string | null;
  ackNumber: string | null;
  downloadUrl?: string | null;
}

export interface AuditRow {
  id: string;
  branchId: string | null;
  branchName: string;
  auditorName: string | null;
  periodLabel: string | null;
  status: string;
  scorePercent: number;
  reportUploaded: boolean;
  reportDate: string | null;
  downloadUrl?: string | null;
}

@Injectable()
export class LegitxComplianceService {
  private readonly logger = new Logger(LegitxComplianceService.name);

  constructor(private readonly db: DbService) {}

  async getComplianceStatus(params: {
    month: number;
    year: number;
    branchId?: string | null;
    lawType?: string | null;
    status?: string | null;
    clientId?: string | null;
  }) {
    const { month, year, branchId, clientId } = params;

    // Returns status per branch for the month
    const returnsRows = await this.db
      .many<{
        branch_id: string | null;
        branch_name: string;
        filed_count: number;
        total_count: number;
        overdue_count: number;
        pending_count: number;
      }>(
        `SELECT
         r.branch_id,
         COALESCE(cb.branchname, 'Branch') AS branch_name,
         COUNT(*) FILTER (WHERE r.filed_date IS NOT NULL) AS filed_count,
         COUNT(*) AS total_count,
         COUNT(*) FILTER (WHERE r.filed_date IS NULL AND r.status = 'REJECTED') AS pending_count,
         COUNT(*) FILTER (WHERE r.filed_date IS NULL AND r.due_date IS NOT NULL AND r.due_date < CURRENT_DATE AND r.status <> 'REJECTED') AS overdue_count
       FROM compliance_returns r
       LEFT JOIN client_branches cb ON cb.id = r.branch_id AND cb.isdeleted = false
       WHERE r.period_year = $1
         AND (r.period_month IS NULL OR r.period_month = $2)
         ${clientId ? 'AND r.client_id = $3' : ''}
         ${branchId ? (clientId ? 'AND r.branch_id = $4' : 'AND r.branch_id = $3') : ''}
       GROUP BY r.branch_id, cb.branchname
       ORDER BY cb.branchname`,
        branchId
          ? clientId
            ? [year, month, clientId, branchId]
            : [year, month, branchId]
          : clientId
            ? [year, month, clientId]
            : [year, month],
      )
      .catch(() => []);

    // Audits per branch (audit table has no branch_id; set null)
    const auditRows = await this.db
      .many<{
        audit_id: string;
        score_percent: number | null;
        status: string;
      }>(
        `SELECT a.id AS audit_id,
              COALESCE(a.score_percent, 0) AS score_percent,
              a.status
       FROM audits a
       WHERE a.period_year = $1
         ${clientId ? 'AND a.client_id = $2' : ''}`,
        clientId ? [year, clientId] : [year],
      )
      .catch(() => []);

    // Build branch rows (limited to returns for now since audits lack branch)
    const branches: BranchComplianceRow[] = returnsRows.map((r) => {
      const returnsPercent = r.total_count
        ? Math.round((r.filed_count / r.total_count) * 100)
        : 0;
      const mcdStatus =
        r.pending_count > 0 || r.overdue_count > 0 ? 'PENDING' : 'SUBMITTED';
      const returnsStatus =
        r.overdue_count > 0
          ? 'OVERDUE'
          : r.pending_count > 0
            ? 'PENDING'
            : 'FILED';
      const auditStatus = 'PENDING';
      const compliancePercent = Math.round(returnsPercent * 0.6); // simple weighting until richer data
      return {
        branchId: r.branch_id,
        branchName: r.branch_name,
        mcdStatus,
        returnsStatus,
        renewalsDue: 0,
        amendmentsOpen: 0,
        auditStatus,
        compliancePercent,
      };
    });

    const totalBranches = branches.length || 1;
    const overallCompliancePercent = Math.round(
      branches.reduce((sum, b) => sum + (b.compliancePercent || 0), 0) /
        totalBranches || 0,
    );
    const branchesCompliant = branches.filter(
      (b) => b.compliancePercent >= 90,
    ).length;
    const pendingItems = branches.reduce(
      (sum, b) => sum + (b.returnsStatus === 'PENDING' ? 1 : 0),
      0,
    );
    const overdueItems = branches.reduce(
      (sum, b) => sum + (b.returnsStatus === 'OVERDUE' ? 1 : 0),
      0,
    );
    const criticalItems = branches.reduce(
      (sum, b) => sum + (b.compliancePercent < 60 ? 1 : 0),
      0,
    );

    const summary: ComplianceStatusSummary = {
      overallCompliancePercent,
      branchesCompliant,
      pendingItems,
      overdueItems,
      criticalItems,
    };

    return { summary, branches };
  }

  async getMcdList(params: {
    month: number;
    year: number;
    branchId?: string | null;
    status?: string | null;
    clientId?: string | null;
  }) {
    const { month, year, branchId, status, clientId } = params;

    const rows = await this.db
      .many<{
        id: number;
        branch_id: string | null;
        branch_name: string;
        establishment_type: string | null;
        state_code: string | null;
        period_month: number | null;
        period_year: number;
        due_date: string | null;
        task_status: string;
        submitted_at: string | null;
        submitted_by: string | null;
      }>(
        `SELECT
         ct.id,
         ct.branch_id,
         COALESCE(cb.branchname, 'Branch') AS branch_name,
         cb.establishment_type,
         cb.statecode AS state_code,
         ct.period_month,
         ct.period_year,
         ct.due_date,
         ct.status AS task_status,
         NULL::text AS submitted_at,
         NULL::text AS submitted_by
       FROM compliance_tasks ct
       LEFT JOIN client_branches cb ON cb.id = ct.branch_id AND cb.isdeleted = false
       WHERE ct.period_year = $1
         AND (ct.period_month IS NULL OR ct.period_month = $2)
         ${clientId ? 'AND ct.client_id = $3' : ''}
         ${branchId ? (clientId ? 'AND ct.branch_id = $4' : 'AND ct.branch_id = $3') : ''}
       ORDER BY cb.branchname NULLS LAST, ct.id DESC`,
        branchId
          ? clientId
            ? [year, month, clientId, branchId]
            : [year, month, branchId]
          : clientId
            ? [year, month, clientId]
            : [year, month],
      )
      .catch(() => []);

    const today = new Date();

    const mapped: McdRow[] = rows
      .map((r) => {
        const baseStatus = r.task_status;
        const overdue = r.due_date && new Date(r.due_date) < today;
        let effective = baseStatus;
        if (
          baseStatus === 'PENDING' ||
          baseStatus === 'IN_PROGRESS' ||
          baseStatus === 'REJECTED' ||
          baseStatus === 'OVERDUE'
        ) {
          if (overdue) effective = 'OVERDUE';
          else
            effective = baseStatus === 'IN_PROGRESS' ? 'SUBMITTED' : 'PENDING';
        }
        if (status && status !== effective) return null;
        return {
          id: String(r.id),
          branchId: r.branch_id,
          branchName: r.branch_name,
          establishmentType: r.establishment_type,
          state: r.state_code,
          month: r.period_month ?? month,
          year: r.period_year,
          status: effective,
          submittedDate: r.submitted_at,
          submittedBy: r.submitted_by,
          reviewedBy: null,
          downloadUrl: null,
        } as McdRow;
      })
      .filter(Boolean) as McdRow[];

    return { data: mapped };
  }

  async getReturns(params: {
    month: number;
    year: number;
    branchId?: string | null;
    lawType?: string | null;
    status?: string | null;
    clientId?: string | null;
  }) {
    const { month, year, branchId, lawType, status, clientId } = params;

    const rows = await this.db
      .many<{
        id: string;
        branch_id: string | null;
        branch_name: string;
        law_type: string;
        return_type: string;
        period_label: string | null;
        due_date: string | null;
        filed_date: string | null;
        filed_by: string | null;
        ack_number: string | null;
        ack_file_path: string | null;
        challan_file_path: string | null;
        status: string;
      }>(
        `SELECT
         r.id,
         r.branch_id,
         COALESCE(cb.branchname, 'Branch') AS branch_name,
         r.law_type,
         r.return_type,
         r.period_label,
         r.due_date,
         r.filed_date,
         r.status,
         r.ack_number,
         r.ack_file_path,
         r.challan_file_path,
         NULL::text AS filed_by
       FROM compliance_returns r
       LEFT JOIN client_branches cb ON cb.id = r.branch_id AND cb.isdeleted = false
       WHERE r.period_year = $1
         AND (r.period_month IS NULL OR r.period_month = $2)
         ${clientId ? 'AND r.client_id = $3' : ''}
         ${branchId ? (clientId ? 'AND r.branch_id = $4' : 'AND r.branch_id = $3') : ''}
         ${lawType ? (clientId ? (branchId ? 'AND r.law_type = $5' : 'AND r.law_type = $4') : branchId ? 'AND r.law_type = $4' : 'AND r.law_type = $3') : ''}
       ORDER BY cb.branchname NULLS LAST, r.law_type, r.return_type`,
        (() => {
          const base: (string | number)[] = [year, month];
          if (clientId) base.push(clientId);
          if (branchId) base.push(branchId);
          if (lawType) base.push(lawType);
          return base;
        })(),
      )
      .catch(() => []);

    const today = new Date();

    const mapped: ReturnRow[] = rows
      .map((r) => {
        let effective = r.status || 'PENDING';
        if (r.filed_date) effective = 'FILED';
        else if (effective === 'REJECTED') effective = 'REJECTED';
        else if (r.due_date && new Date(r.due_date) < today)
          effective = 'OVERDUE';
        else effective = 'PENDING';
        if (status && status !== effective) return null;

        const downloadUrl = r.ack_file_path || r.challan_file_path || null;

        return {
          id: r.id,
          branchId: r.branch_id,
          branchName: r.branch_name,
          lawType: r.law_type,
          periodLabel:
            r.period_label || `${year}-${String(month).padStart(2, '0')}`,
          dueDate: r.due_date,
          status: effective,
          filedDate: r.filed_date,
          filedBy: r.filed_by,
          ackNumber: r.ack_number,
          downloadUrl,
        } as ReturnRow;
      })
      .filter(Boolean) as ReturnRow[];

    return { data: mapped };
  }

  async getAudits(params: {
    month: number;
    year: number;
    branchId?: string | null;
    status?: string | null;
    clientId?: string | null;
  }) {
    const { month, year, status, clientId } = params;

    const rows = await this.db
      .many<{
        id: string;
        branch_id: string | null;
        branch_name: string | null;
        auditor_name: string | null;
        period_code: string;
        status: string;
        score_percent: number | null;
        report_path: string | null;
        report_date: string | null;
      }>(
        `WITH latest_report AS (
         SELECT ar.audit_id, ar.file_path, ar.report_date,
                ROW_NUMBER() OVER (PARTITION BY ar.audit_id ORDER BY ar.report_date DESC NULLS LAST, ar.uploaded_at DESC) AS rn
         FROM audit_reports ar
       )
       SELECT a.id,
              NULL::uuid AS branch_id,
              NULL::text AS branch_name,
              u.name AS auditor_name,
              a.period_code,
              a.status,
              COALESCE(a.score_percent, 0) AS score_percent,
              lr.file_path AS report_path,
              lr.report_date
       FROM audits a
       LEFT JOIN users u ON u.id = a.assigned_auditor_id
       LEFT JOIN latest_report lr ON lr.audit_id = a.id AND lr.rn = 1
       WHERE a.period_year = $1
         ${clientId ? 'AND a.client_id = $2' : ''}
         AND (SUBSTRING(a.period_code FROM 6 FOR 2) = LPAD($3::text, 2, '0') OR a.period_code LIKE $4)
       ORDER BY a.created_at DESC`,
        clientId
          ? [year, month, month, `${year}-${String(month).padStart(2, '0')}%`]
          : [year, month, month, `${year}-${String(month).padStart(2, '0')}%`],
      )
      .catch(() => []);

    const mapped: AuditRow[] = rows
      .map((r) => {
        if (status && status !== r.status) return null;
        return {
          id: r.id,
          branchId: r.branch_id,
          branchName: r.branch_name ?? 'Branch',
          auditorName: r.auditor_name,
          periodLabel: r.period_code,
          status: r.status,
          scorePercent: r.score_percent ?? 0,
          reportUploaded: !!r.report_path,
          reportDate: r.report_date,
          downloadUrl: r.report_path,
        } as AuditRow;
      })
      .filter(Boolean) as AuditRow[];

    return { data: mapped };
  }

  async getAuditObservations(auditId: string, clientId?: string | null) {
    const rows = await this.db
      .many<{
        observation: string;
        consequences: string | null;
        compliance_requirements: string | null;
        elaboration: string | null;
        status: string;
      }>(
        `SELECT ao.observation,
              ao.consequences,
              ao.compliance_requirements,
              ao.elaboration,
              ao.status
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE ao.audit_id = $1
         ${clientId ? 'AND a.client_id = $2' : ''}
       ORDER BY ao.created_at ASC`,
        clientId ? [auditId, clientId] : [auditId],
      )
      .catch(() => []);

    const data = rows.map((r) => ({
      observation: r.observation,
      consequence: r.consequences,
      requirement: r.compliance_requirements,
      remarks: r.elaboration,
      status: r.status,
    }));

    return { data };
  }

  async getReturnDownload(id: string, clientId?: string | null) {
    const row = await this.db
      .one<{ file_path: string | null }>(
        `SELECT COALESCE(ack_file_path, challan_file_path) AS file_path
         FROM compliance_returns
         WHERE id = $1 ${clientId ? 'AND client_id = $2' : ''}`,
        clientId ? [id, clientId] : [id],
      )
      .catch(() => null);

    return { downloadUrl: row?.file_path ?? null };
  }

  async getAuditReportDownload(auditId: string, clientId?: string | null) {
    const row = await this.db
      .one<{ file_path: string | null }>(
        `SELECT ar.file_path
         FROM audit_reports ar
         JOIN audits a ON a.id = ar.audit_id
         WHERE ar.audit_id = $1 ${clientId ? 'AND a.client_id = $2' : ''}
         ORDER BY ar.report_date DESC NULLS LAST, ar.uploaded_at DESC
         LIMIT 1`,
        clientId ? [auditId, clientId] : [auditId],
      )
      .catch(() => null);

    return { downloadUrl: row?.file_path ?? null };
  }
}
