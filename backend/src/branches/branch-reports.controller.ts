import {
  Controller,
  Get,
  Logger,
  UseGuards,
  Query as QueryParam,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

/**
 * Branch-portal report endpoints.
 * Accessible by BRANCH_MANAGER / BRANCH_EXEC users.
 */
@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/reports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'BRANCH_DESK',
  'BRANCH_MANAGER',
  'BRANCH_EXEC',
  'CLIENT',
  'ADMIN',
  'CEO',
  'CCO',
)
export class BranchReportsController {
  private readonly logger = new Logger(BranchReportsController.name);
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Registration Expiry Report
   * Returns all registrations for the user's client (optionally filtered by branch)
   * with expiry status computed server-side.
   */
  @ApiOperation({ summary: 'Registration Expiry' })
  @Get('registration-expiry')
  async registrationExpiry(
    @CurrentUser() user: ReqUser,
    @QueryParam('branchId') branchId?: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) return { data: [] };

    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND r.branch_id = $2';
      params.push(branchId);
    }

    const rows = await this.dataSource
      .query(
        `SELECT
         r.id,
         r.type,
         r.registration_number  AS "registrationNumber",
         r.authority,
         r.issued_date          AS "issuedDate",
         r.expiry_date          AS "expiryDate",
         r.status,
         r.remarks,
         b.branchname          AS "branchName",
         CASE
           WHEN r.expiry_date IS NULL THEN 'NO_EXPIRY'
           WHEN r.expiry_date < CURRENT_DATE THEN 'EXPIRED'
           WHEN r.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
           WHEN r.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'EXPIRING'
           ELSE 'ACTIVE'
         END AS "expiryStatus",
         CASE
           WHEN r.expiry_date IS NOT NULL THEN r.expiry_date - CURRENT_DATE
           ELSE NULL
         END AS "daysUntilExpiry"
       FROM branch_registrations r
       JOIN client_branches b ON b.id = r.branch_id
       WHERE r.client_id = $1 ${branchFilter}
       ORDER BY
         CASE
           WHEN r.expiry_date IS NULL THEN 3
           WHEN r.expiry_date < CURRENT_DATE THEN 0
           WHEN r.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1
           ELSE 2
         END,
         r.expiry_date ASC NULLS LAST`,
        params,
      )
      .catch((e) => {
        this.logger.error('registration-expiry query failed', e?.message);
        return [];
      });

    // Summary counts
    let expired = 0,
      expiringSoon = 0,
      active = 0;
    for (const r of rows) {
      if (r.expiryStatus === 'EXPIRED') expired++;
      else if (
        r.expiryStatus === 'EXPIRING_SOON' ||
        r.expiryStatus === 'EXPIRING'
      )
        expiringSoon++;
      else active++;
    }

    return {
      data: rows,
      summary: { total: rows.length, expired, expiringSoon, active },
    };
  }

  /**
   * Audit Observation Report
   * Returns open/closed observations for audits scoped to the user's client,
   * with aging analysis.
   */
  @ApiOperation({ summary: 'Audit Observations' })
  @Get('audit-observations')
  async auditObservations(
    @CurrentUser() user: ReqUser,
    @QueryParam('branchId') branchId?: string,
    @QueryParam('status') status?: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) return { data: [] };

    const params: unknown[] = [clientId];
    let idx = 2;
    const filters: string[] = [];

    if (branchId) {
      filters.push(`a.branch_id = $${idx++}`);
      params.push(branchId);
    }
    if (status) {
      filters.push(`o.status = $${idx++}`);
      params.push(status);
    }

    const where = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

    const rows = await this.dataSource
      .query(
        `SELECT
         o.id,
         o.observation,
         o.consequences,
         o.clause,
         o.recommendation,
         o.risk,
         o.status,
         o.created_at            AS "createdAt",
         o.updated_at            AS "updatedAt",
         a.audit_code            AS "auditCode",
         a.audit_type            AS "auditType",
         a.period_code           AS "periodCode",
         a.period_year           AS "periodYear",
         b.branchname           AS "branchName",
         EXTRACT(DAY FROM NOW() - o.created_at)::int AS "ageDays"
       FROM audit_observations o
       JOIN audits a ON a.id = o.audit_id
       LEFT JOIN client_branches b ON b.id = a.branch_id
       WHERE a.client_id = $1 ${where}
       ORDER BY
         CASE o.risk
           WHEN 'CRITICAL' THEN 0
           WHEN 'HIGH' THEN 1
           WHEN 'MEDIUM' THEN 2
           WHEN 'LOW' THEN 3
           ELSE 4
         END,
         o.created_at DESC`,
        params,
      )
      .catch((e) => {
        this.logger.error('audit-observations query failed', e?.message);
        return [];
      });

    // Summary
    let open = 0,
      resolved = 0,
      critical = 0,
      avgAge = 0;
    for (const r of rows) {
      if (r.status === 'OPEN' || r.status === 'ACKNOWLEDGED') {
        open++;
        avgAge += r.ageDays || 0;
      } else {
        resolved++;
      }
      if (r.risk === 'CRITICAL') critical++;
    }
    avgAge = open > 0 ? Math.round(avgAge / open) : 0;

    return {
      data: rows,
      summary: {
        total: rows.length,
        open,
        resolved,
        critical,
        avgAgeDays: avgAge,
      },
    };
  }

  /**
   * Monthly Compliance Summary
   * PF, ESIC, PT, LWF challan summary grouped by compliance type for a given month.
   */
  @ApiOperation({ summary: 'Monthly Compliance Summary' })
  @Get('compliance-summary')
  async complianceSummary(
    @CurrentUser() user: ReqUser,
    @QueryParam('year') year?: string,
    @QueryParam('month') month?: string,
    @QueryParam('branchId') branchId?: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) return { data: [], summary: {} };

    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;

    const params: unknown[] = [clientId, y, m];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND ct.branch_id = $4';
      params.push(branchId);
    }

    const rows = await this.dataSource
      .query(
        `SELECT
           cm.law_name                                   AS "lawName",
           ct.title                                      AS "taskTitle",
           ct.frequency,
           ct.status,
           ct.due_date                                   AS "dueDate",
           ct.remarks,
           b.branchname                                  AS "branchName",
           cm.code                                       AS "complianceCode"
         FROM compliance_tasks ct
         JOIN compliance_master cm ON cm.id = ct.compliance_id
         LEFT JOIN client_branches b ON b.id = ct.branch_id
         WHERE ct.client_id = $1
           AND ct.period_year = $2
           AND (ct.period_month = $3 OR ct.period_month IS NULL)
           ${branchFilter}
         ORDER BY cm.law_name, ct.due_date`,
        params,
      )
      .catch((e) => {
        this.logger.error('compliance-summary query failed', e?.message);
        return [];
      });

    let total = 0,
      approved = 0,
      pending = 0,
      overdue = 0;
    for (const r of rows) {
      total++;
      if (r.status === 'APPROVED') approved++;
      else if (r.status === 'OVERDUE') overdue++;
      else pending++;
    }

    return {
      data: rows,
      summary: { total, approved, pending, overdue },
    };
  }

  /**
   * PF/ESIC Registration Status
   * Employee-wise PF (UAN) and ESIC registration tracker.
   */
  @ApiOperation({ summary: 'PF/ESIC Registration Status' })
  @Get('pf-esic-status')
  async pfEsicStatus(
    @CurrentUser() user: ReqUser,
    @QueryParam('branchId') branchId?: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) return { data: [], summary: {} };

    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND e.branch_id = $2';
      params.push(branchId);
    }

    const rows = await this.dataSource
      .query(
        `SELECT
           e.id,
           e.name,
           e.employee_code                AS "employeeCode",
           e.uan,
           e.esic,
           e.is_active                    AS "isActive",
           b.branchname                   AS "branchName",
           CASE WHEN e.uan IS NOT NULL AND e.uan <> '' THEN true ELSE false END AS "pfRegistered",
           CASE WHEN e.esic IS NOT NULL AND e.esic <> '' THEN true ELSE false END AS "esicRegistered"
         FROM employees e
         LEFT JOIN client_branches b ON b.id = e.branch_id
         WHERE e.client_id = $1
           AND e.is_active = true
           ${branchFilter}
         ORDER BY e.name`,
        params,
      )
      .catch((e) => {
        this.logger.error('pf-esic-status query failed', e?.message);
        return [];
      });

    let total = 0,
      pfRegistered = 0,
      esicRegistered = 0,
      bothRegistered = 0,
      neitherRegistered = 0;
    for (const r of rows) {
      total++;
      const pf = r.pfRegistered;
      const es = r.esicRegistered;
      if (pf) pfRegistered++;
      if (es) esicRegistered++;
      if (pf && es) bothRegistered++;
      if (!pf && !es) neitherRegistered++;
    }

    return {
      data: rows,
      summary: {
        total,
        pfRegistered,
        esicRegistered,
        bothRegistered,
        neitherRegistered,
      },
    };
  }

  /**
   * Headcount Report
   * Employee and contractor headcount with M/F breakdown.
   */
  @ApiOperation({ summary: 'Headcount Report' })
  @Get('headcount')
  async headcount(
    @CurrentUser() user: ReqUser,
    @QueryParam('branchId') branchId?: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) return { data: [], summary: {} };

    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND e.branch_id = $2';
      params.push(branchId);
    }

    const rows = await this.dataSource
      .query(
        `SELECT
           b.branchname                                  AS "branchName",
           COUNT(*) FILTER (WHERE e.is_active = true)::int                          AS "totalActive",
           COUNT(*) FILTER (WHERE e.is_active = false)::int                         AS "totalInactive",
           COUNT(*) FILTER (WHERE e.is_active = true AND LOWER(e.gender) = 'male')::int    AS "male",
           COUNT(*) FILTER (WHERE e.is_active = true AND LOWER(e.gender) = 'female')::int  AS "female",
           COUNT(*) FILTER (WHERE e.is_active = true AND (e.gender IS NULL OR LOWER(e.gender) NOT IN ('male','female')))::int AS "other"
         FROM employees e
         LEFT JOIN client_branches b ON b.id = e.branch_id
         WHERE e.client_id = $1 ${branchFilter}
         GROUP BY b.branchname
         ORDER BY b.branchname`,
        params,
      )
      .catch((e) => {
        this.logger.error('headcount query failed', e?.message);
        return [];
      });

    let totalActive = 0,
      totalInactive = 0,
      male = 0,
      female = 0;
    for (const r of rows) {
      totalActive += r.totalActive || 0;
      totalInactive += r.totalInactive || 0;
      male += r.male || 0;
      female += r.female || 0;
    }

    return {
      data: rows,
      summary: {
        totalActive,
        totalInactive,
        male,
        female,
        branches: rows.length,
      },
    };
  }

  /**
   * Contractor Upload Summary
   * Document upload % by contractor for a selected month.
   */
  @ApiOperation({ summary: 'Contractor Upload Summary' })
  @Get('contractor-uploads')
  async contractorUploads(
    @CurrentUser() user: ReqUser,
    @QueryParam('month') month?: string,
    @QueryParam('branchId') branchId?: string,
  ) {
    const clientId = user.clientId;
    if (!clientId) return { data: [], summary: {} };

    // month format: YYYY-MM (default: current month)
    const now = new Date();
    const docMonth =
      month ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const params: unknown[] = [clientId, docMonth];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND cd.branch_id = $3';
      params.push(branchId);
    }

    const rows = await this.dataSource
      .query(
        `SELECT
           u.name                                        AS "contractorName",
           u.email                                       AS "contractorEmail",
           b.branchname                                  AS "branchName",
           COUNT(*)::int                                 AS "totalDocs",
           COUNT(*) FILTER (WHERE cd.status = 'APPROVED')::int   AS "approved",
           COUNT(*) FILTER (WHERE cd.status = 'REJECTED')::int   AS "rejected",
           COUNT(*) FILTER (WHERE cd.status IN ('UPLOADED','PENDING_REVIEW'))::int AS "pending",
           ROUND(
             COUNT(*) FILTER (WHERE cd.status = 'APPROVED') * 100.0 / NULLIF(COUNT(*), 0), 1
           )::float                                      AS "approvalPct"
         FROM contractor_documents cd
         JOIN users u ON u.id = cd.contractor_user_id
         LEFT JOIN client_branches b ON b.id = cd.branch_id
         WHERE cd.client_id = $1
           AND cd.doc_month = $2
           ${branchFilter}
         GROUP BY u.name, u.email, b.branchname
         ORDER BY "approvalPct" ASC NULLS LAST, u.name`,
        params,
      )
      .catch((e) => {
        this.logger.error('contractor-uploads query failed', e?.message);
        return [];
      });

    let totalDocs = 0,
      totalApproved = 0,
      totalPending = 0;
    for (const r of rows) {
      totalDocs += r.totalDocs || 0;
      totalApproved += r.approved || 0;
      totalPending += r.pending || 0;
    }

    return {
      data: rows,
      summary: {
        contractors: rows.length,
        totalDocs,
        totalApproved,
        totalPending,
        overallPct:
          totalDocs > 0 ? Math.round((totalApproved * 100) / totalDocs) : 0,
      },
    };
  }
}
