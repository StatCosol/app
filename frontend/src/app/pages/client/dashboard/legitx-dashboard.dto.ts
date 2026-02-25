export type LegitxToggle = 'ALL' | 'CRITICAL' | 'PENDING';

export interface LegitxDashboardScope {
  month: number;
  year: number;
  branchId?: string | number | null;
  contractorId?: string | number | null;
  clientId?: string | null;
  toggle?: LegitxToggle;
}

export interface LegitxDashboardResponse {
  scope: LegitxDashboardScope;
  kpis: LegitxKpiBlock;
  charts: LegitxCharts;
  queues: LegitxQueues;
  meta?: LegitxMeta;
}

export interface LegitxKpiBlock {
  employees: {
    total: number;
    male: number;
    female: number;
    active: number;
    joiners: number;
    left: number;
    absconded: number;
  };
  contractors: {
    total: number;
    male: number;
    female: number;
  };
  payroll: {
    pendingQueries: number;
    pendingEmployees: number;
    pfPendingEmployees: number;
    esiPendingEmployees: number;
    completedFF: number;
    pendingFF: number;
  };
  branches: {
    total: number;
    live: number;
    closed: number;
  };
  compliance: {
    overallPercent: number;
    branchAvgPercent: number;
    contractorAvgPercent: number;
  };
  audits: {
    overallAuditScore: number;
    completed: number;
    pending: number;
    overdue: number;
  };
}

export interface LegitxCharts {
  complianceTrend: {
    labels: string[];
    overall: number[];
    branchAvg: number[];
    contractorAvg: number[];
  };
  complianceOps: {
    labels: string[];
    done: number[];
    pending: number[];
    overdue: number[];
  };
  branchComplianceRanking: {
    labels: string[];
    values: number[];
    branchIds?: Array<string | number>;
  };
  auditCompletion: {
    completed: number;
    pending: number;
    overdue: number;
    overallScore: number;
  };
  payrollExceptions: {
    pendingQueries: number;
    pfPendingEmployees: number;
    esiPendingEmployees: number;
    pendingFF: number;
    completedFF: number;
  };
  employeeStatus: {
    labels: string[];
    active: number[];
    joiners: number[];
    left: number[];
    absconded: number[];
  };
  contractorDocsBuckets: {
    labels: string[];
    values: number[];
  };
}

export interface LegitxQueueItem {
  type: string;
  branchId?: string | number | null;
  branchName?: string;
  contractorId?: string | number | null;
  contractorName?: string;
  label: string;
  ageDays: number;
  owner: string;
  dueDate?: string;
}

export interface LegitxQueues {
  critical: LegitxQueueItem[];
  pending: LegitxQueueItem[];
}

export interface LegitxMeta {
  branches?: Array<{ id: string | number; name: string }>;
  contractors?: Array<{ id: string | number; name: string; branchId?: string | number }>;
}