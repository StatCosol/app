export interface AdminStatsDto {
  clients: number;
  branches: number;
  users: number;
  openQueries: number;
  overdueTasks: number;
  slaBreaches: number;
  pendingApprovals: number;
  unreadNotifications: number;
}

export interface AdminDashboardSummaryDto {
  clients: number;
  branches: number;
  slaHealth: {
    status: 'GREEN' | 'AMBER' | 'RED';
    scorePct: number;
  };
  overdueAudits: number;
  dueSoon: number;
  unreadNotifications: number;
  escalations: Array<{
    id: string;
    clientId: string;
    clientName: string;
    issueType: 'AUDIT' | 'ASSIGNMENT' | 'SYSTEM' | 'NOTIFICATION';
    reason: string;
    ownerRole: string;
    ownerName: string | null;
    daysDelayed: number;
    lastUpdated: string;
  }>;
  assignmentsAttention: Array<{
    id: string;
    clientId: string;
    clientName: string;
    assignmentType: 'CRM' | 'AUDITOR';
    assignedTo: string;
    assignedOn: string;
    rotationDueOn: string;
    status: 'ACTIVE' | 'OVERDUE_ROTATION' | 'MISSING';
  }>;
  systemHealth: {
    inactiveUsers15d: number;
    unassignedClients: number;
    failedNotifications7d: number;
    failedJobs24h: number;
  };
}

export interface TaskStatusDto {
  completed: number;
  pending: number;
  overdue: number;
}

export interface LoadRowDto {
  userId: string;
  name: string;
  clientsAssigned: number;
  openItems: number;
  overdue: number;
  slaBreaches: number;
}

export type Severity = 'High' | 'Medium' | 'Low';
export type AttentionType = 'Overdue' | 'SLA Breach' | 'Query Delay';
export type AttentionStatus = 'Open' | 'In Progress' | 'Escalated';

export interface AttentionItemDto {
  type: AttentionType;
  taskId: string;
  client: string;
  branch: string;
  assignedTo: string;
  dueDate: string;
  daysLate: number;
  severity: Severity;
  status: AttentionStatus;
}

export interface SlaTrendDto {
  values: number[];
}

// ───── Governance Layer DTOs ─────

export interface AssignmentSummaryDto {
  totalClients: number;
  crmAssigned: number;
  crmUnassigned: number;
  auditorAssigned: number;
  auditorUnassigned: number;
}

export interface UnassignedClientDto {
  clientId: string;
  clientName: string;
  branchCount: number;
  hasCrm: boolean;
  hasPayrollUser: boolean;
  hasMasterUser: boolean;
}

export interface AuditSummaryDto {
  clientId: string;
  clientName: string;
  lastAuditDate: string | null;
  nextDueDate: string | null;
  status: 'OVERDUE' | 'ON_TRACK' | 'NO_AUDITS';
  overdueCount: number;
}

export interface RiskAlertsDto {
  auditOverdue: number;
  noCrm: number;
  noPayroll: number;
  zeroBranches: number;
  noMcdUploads: number;
}
