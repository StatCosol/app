/**
 * CRM Dashboard Data Transfer Objects
 * Operational compliance owner view - execution and tracking for assigned clients/branches
 */

/** Request filters for CRM dashboard data */
export interface CrmFilters {
  clientId?: string;
  branchId?: string;
  periodFrom?: string; // YYYY-MM-DD
  periodTo?: string;   // YYYY-MM-DD
}

/** Summary KPI metrics for CRM role */
export interface CrmSummary {
  assignedClientsCount: number;
  assignedBranchesCount: number;
  complianceCoveragePct: number;
  overdueCompliancesCount: number;
  dueSoonCompliancesCount: number;
  openComplianceQueriesCount: number;
}

/** Compliance item due/overdue */
export interface ComplianceDueItem {
  refId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  category: string;
  complianceItem: string;
  dueDate: string; // YYYY-MM-DD
  daysOverdue: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OVERDUE' | 'DUE_SOON' | 'DUE_THIS_MONTH' | 'PENDING' | 'DONE';
}

/** Branch with low compliance coverage - risk view */
export interface LowCoverageBranch {
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  coveragePct: number;
  overdueCount: number;
  highRiskCount: number;
}

/** Pending document submission from contractor */
export interface PendingDocument {
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  documentType: string;
  requestedOn: string; // YYYY-MM-DD
  pendingDays: number;
  status: 'REQUESTED' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED';
}

/** Compliance query/thread */
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
  status: 'OPEN' | 'PENDING_REPLY' | 'RESOLVED' | 'CLOSED';
  lastUpdated?: string; // ISO date string
}

/** API response wrappers */
export interface CrmDueCompliancesResponse {
  items: ComplianceDueItem[];
}

export interface CrmLowCoverageResponse {
  items: LowCoverageBranch[];
}

export interface CrmPendingDocumentsResponse {
  items: PendingDocument[];
}

export interface CrmQueriesResponse {
  items: ComplianceQuery[];
}
