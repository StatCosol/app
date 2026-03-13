import {
  Controller,
  Get,
  Logger,
  Req,
  UseGuards,
  Query as QueryParam,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataSource } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
    @Req() req: any,
    @QueryParam('branchId') branchId?: string,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) return { data: [] };

    const params: any[] = [clientId];
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
    @Req() req: any,
    @QueryParam('branchId') branchId?: string,
    @QueryParam('status') status?: string,
  ) {
    const clientId = req.user.clientId;
    if (!clientId) return { data: [] };

    const params: any[] = [clientId];
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
}
