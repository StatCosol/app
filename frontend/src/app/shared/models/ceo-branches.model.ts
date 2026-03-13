export interface CeoBranchRow {
  branchId: string;
  branchName: string;
  clientName: string;
  state: string;
  compliancePercent: number;
  overdueCount: number;
  auditScore: number;
  riskExposureScore: number;
}

export interface CeoBranchDetail {
  branchId: string;
  branchName: string;
  clientId?: string;
  clientName?: string;
  state?: string;
  month: string;
  complianceSummary: {
    overall: number;
    mcd: number;
    returns: number;
    audits: number;
  };
  overdueItems: number;
  dueSoonItems: number;
  openQueries: number;
  topIssues: { title: string; count: number; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }[];
  auditSummary?: {
    planned: number;
    ongoing: number;
    completed: number;
    avgScore: number;
    openHighRiskObservations: number;
  };
  payrollRisk?: {
    totalRuns: number;
    approvedRuns: number;
    pendingRuns: number;
    exceptionRuns: number;
    riskScore: number;
  };
  contractorRisk?: {
    contractorCount: number;
    pendingItems: number;
    overdueItems: number;
    riskScore: number;
  };
  alerts?: {
    escalatedTasks: number;
    openObservations: number;
    openQueries: number;
  };
}
