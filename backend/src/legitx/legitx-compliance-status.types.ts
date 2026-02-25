/** Types for the Compliance Status dashboard */

export interface ComplianceStatusSummaryResponse {
  overallCompliancePct: number;
  totalBranches: number;
  totalApplicable: number;
  approved: number;
  pending: number;
  overdue: number;
  rejected: number;
  inReview: number;
  criticalNonCompliances: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface BranchComplianceRow {
  branchId: string;
  branchName: string;
  stateCode: string | null;
  establishmentType: string;
  compliancePct: number;
  approved: number;
  totalApplicable: number;
  pending: number;
  overdue: number;
  rejected: number;
  auditScore: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ComplianceTaskRow {
  taskId: number;
  complianceCode: string | null;
  title: string;
  lawName: string | null;
  frequency: string;
  status: string;
  dueDate: string | null;
  delayDays: number;
  branchId: string | null;
  branchName: string | null;
  remarks: string | null;
}

export interface ContractorImpactRow {
  contractorUserId: string;
  contractorName: string;
  branchId: string | null;
  branchName: string | null;
  totalDocuments: number;
  approvedDocuments: number;
  pendingDocuments: number;
  rejectedDocuments: number;
  expiredDocuments: number;
  compliancePct: number;
}

export interface AuditImpactResponse {
  lastAuditDate: string | null;
  overallAuditScore: number;
  totalAudits: number;
  completedAudits: number;
  openObservations: number;
  criticalObservations: number;
  highObservations: number;
  reverifyPending: number;
  observations: AuditObservationRow[];
}

export interface AuditObservationRow {
  id: string;
  auditId: string;
  observation: string;
  risk: string | null;
  status: string;
  category: string | null;
}
