import { Injectable, BadRequestException } from '@nestjs/common';
import { DbService } from '../common/db/db.service';
import { normalizeDateFilters, normalizePaging, FilterQuery } from '../common/utils/filters';
import { AUDIT_TAB, AuditorAuditTab } from '../common/utils/enums';
import {
  AUDITOR_SUMMARY_SQL,
  AUDITOR_AUDITS_SQL,
  AUDITOR_OBSERVATIONS_SQL,
  AUDITOR_REPORTS_SQL,
} from './sql/auditor-dashboard.sql';

export interface AuditorSummaryDto {
  assigned_audits_count: number;
  overdue_audits_count: number;
  due_soon_audits_count: number;
  observations_open_count: number;
  high_risk_open_count: number;
  reports_pending_count: number;
}

export interface AuditorAuditDto {
  auditId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  auditType: string;
  auditName: string;
  dueDate: Date;
  status: string;
  progressPct: number;
  lastUpdatedAt: Date;
}

export interface AuditorObservationDto {
  observationId: string;
  auditId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  title: string;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  ownerName: string;
  ownerRole: string;
  status: string;
  ageingDays: number;
  createdAt: Date;
}

export interface AuditorReportDto {
  auditId: string;
  auditCode: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  dueDate: Date;
  status: string;
  lastUpdatedAt: Date;
}

/**
 * Auditor Dashboard Service
 * Executes raw SQL queries with USER SCOPING enforced
 * ⚠️ CRITICAL: auditorUserId must always come from JWT token, never from query params
 */
@Injectable()
export class AuditorDashboardService {
  constructor(private readonly db: DbService) {}

  /**
   * Get Auditor dashboard summary KPIs
   * Scoped to audits assigned to the auditor user
   */
  async getSummary(
    auditorUserId: string,
    query: FilterQuery,
  ): Promise<AuditorSummaryDto> {
    const f = normalizeDateFilters(query);

    return this.db.one<AuditorSummaryDto>(AUDITOR_SUMMARY_SQL, [
      auditorUserId,
      f.clientId,
      f.fromDate,
      f.toDate,
      f.windowDays,
    ]);
  }

  /**
   * Get auditor's assigned audits by tab (ACTIVE, OVERDUE, DUE_SOON, COMPLETED)
   * Scoped to auditor's assigned audits
   */
  async getAudits(
    auditorUserId: string,
    query: FilterQuery,
  ): Promise<AuditorAuditDto[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    const tab = String(query.tab ?? 'ACTIVE').toUpperCase() as AuditorAuditTab;
    if (!AUDIT_TAB.includes(tab)) {
      throw new BadRequestException(`Invalid tab. Use ${AUDIT_TAB.join(', ')}`);
    }

    return this.db.many<AuditorAuditDto>(AUDITOR_AUDITS_SQL, [
      auditorUserId,
      f.clientId,
      f.fromDate,
      f.toDate,
      f.windowDays,
      tab,
      p.limit,
      p.offset,
    ]);
  }

  /**
   * Get observations pending closure for auditor's audits
   * Scoped to auditor's assigned audits
   */
  async getObservations(
    auditorUserId: string,
    query: FilterQuery,
  ): Promise<AuditorObservationDto[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    const status = query.status ? String(query.status).toUpperCase() : null; // OPEN/IN_PROGRESS/CLOSED
    const risk = query.risk ? String(query.risk).toUpperCase() : null; // HIGH/MEDIUM/LOW

    return this.db.many<AuditorObservationDto>(AUDITOR_OBSERVATIONS_SQL, [
      auditorUserId,
      f.clientId,
      status,
      risk,
      p.limit,
      p.offset,
    ]);
  }

  /**
   * Get audit reports pending submission
   * Scoped to auditor's assigned audits
   */
  async getReports(
    auditorUserId: string,
    query: FilterQuery,
  ): Promise<AuditorReportDto[]> {
    const f = normalizeDateFilters(query);
    const p = normalizePaging(query);

    const status = query.status ? String(query.status).toUpperCase() : null; // PENDING_SUBMISSION / SUBMITTED
    return this.db.many<AuditorReportDto>(AUDITOR_REPORTS_SQL, [
      auditorUserId,
      status,
      f.clientId,
      f.fromDate,
      f.toDate,
      p.limit,
      p.offset,
    ]);
  }
}
