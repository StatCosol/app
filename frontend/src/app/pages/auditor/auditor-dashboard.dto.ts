/**
 * Auditor Dashboard Data Transfer Objects
 * Audit execution view - assigned audits, observations, evidence, and reporting
 */

/** Request filters for Auditor dashboard data */
export interface AuditorFilters {
  clientId?: string | null;
  auditType?: 'STATUTORY' | 'INTERNAL' | 'CLIENT_SPECIFIC' | null;
  fromDate?: string | null;
  toDate?: string | null;
}

/** Summary KPI metrics for Auditor role */
export interface AuditorSummary {
  assignedAuditsCount: number;
  overdueAuditsCount: number;
  dueSoonAuditsCount: number;
  observationsOpenCount: number;
  highRiskOpenCount: number;
  reportsPendingCount: number;
}

/** Audit item in auditor's assigned list */
export interface AuditorAuditItem {
  auditId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  auditName: string;
  dueDate: string; // YYYY-MM-DD
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SUBMITTED';
  progressPct: number;
}

/** Observation pending closure */
export interface AuditorObservationPending {
  observationId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  title: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ageingDays: number;
  ownerRole: string;
  ownerName?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}

/** Evidence/Document pending submission */
export interface AuditorEvidencePending {
  id: string;
  auditId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  evidenceName: string;
  requestedOn: string; // YYYY-MM-DD
  pendingDays: number;
  status: 'AWAITING_CLIENT' | 'AWAITING_CRM' | 'RECEIVED' | 'NOT_REQUIRED';
}

/** Audit report pending submission */
export interface AuditorReportPending {
  auditId: string;
  reportId: string;
  clientId: string;
  clientName: string;
  branchId?: string;
  branchName?: string;
  auditName: string;
  dueDate: string; // YYYY-MM-DD
  status: 'PENDING_SUBMISSION' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
}

/** Activity timeline item */
export interface AuditorActivityItem {
  id: string;
  activityType: 'AUDIT_STARTED' | 'OBSERVATION_ADDED' | 'EVIDENCE_RECEIVED' | 'REPORT_SUBMITTED' | 'OTHER';
  description: string;
  timestamp: string; // ISO date string
  clientName?: string;
  auditName?: string;
}

/** API response wrappers */
export interface AuditorAuditsResponse {
  items: AuditorAuditItem[];
}

export interface AuditorObservationsResponse {
  items: AuditorObservationPending[];
}

export interface AuditorEvidenceResponse {
  items: AuditorEvidencePending[];
}

export interface AuditorReportsResponse {
  items: AuditorReportPending[];
}

export interface AuditorActivityResponse {
  items: AuditorActivityItem[];
}
