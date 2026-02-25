/**
 * CRM Dashboard Data Transfer Objects  (V2 — redesigned)
 */

/* ═══════ V2 KPIs ═══════ */
export interface CrmKpis {
  assignedClientsCount: number;
  compliancePct: number;
  pendingReviewCount: number;
  reuploadRequiredCount: number;
  overdueCount: number;
  expiring30Count: number;
  openObservationsCount: number;
  mcdPendingCount: number;
}

export interface PriorityItem {
  itemType: 'OVERDUE_TASK' | 'EXPIRED_DOC' | 'HIGH_RISK_OBS';
  clientName: string;
  branchName: string;
  contractorName: string | null;
  itemName: string;
  complianceType: string;
  daysOverdue: number;
  refId: string;
}

export interface RiskClient {
  clientId: string;
  clientName: string;
  compliancePct: number;
  pendingCount: number;
  reuploadCount: number;
  openObservations: number;
  expiringCount: number;
}

export interface UpcomingAudit {
  auditId: string;
  auditCode: string;
  auditType: string;
  clientName: string;
  branchName: string;
  auditorName: string;
  dueDate: string;
  status: string;
  daysUntil: number;
}

/* ═══════ Legacy (kept for backward-compat imports) ═══════ */

export interface CrmFilters {
  clientId?: string;
  branchId?: string;
  periodFrom?: string;
  periodTo?: string;
}

export interface CrmSummary {
  assignedClientsCount: number;
  assignedBranchesCount: number;
  complianceCoveragePct: number;
  overdueCompliancesCount: number;
  dueSoonCompliancesCount: number;
  openComplianceQueriesCount: number;
}

export interface ComplianceDueItem {
  refId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  category: string;
  complianceItem: string;
  dueDate: string;
  daysOverdue: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
}

export interface LowCoverageBranch {
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  coveragePct: number;
  overdueCount: number;
  highRiskCount: number;
}

export interface PendingDocument {
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  documentType: string;
  requestedOn: string;
  pendingDays: number;
  status: string;
}

export interface ComplianceQuery {
  refId: string;
  fromRole: string;
  fromName: string;
  clientId: string;
  clientName: string;
  branchId?: string;
  branchName?: string;
  subject: string;
  ageingDays: number;
  status: string;
  lastUpdated?: string;
}

export interface CrmDueCompliancesResponse { items: ComplianceDueItem[]; }
export interface CrmLowCoverageResponse { items: LowCoverageBranch[]; }
export interface CrmPendingDocumentsResponse { items: PendingDocument[]; }
export interface CrmQueriesResponse { items: ComplianceQuery[]; }
