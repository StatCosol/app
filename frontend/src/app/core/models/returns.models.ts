export interface ComplianceCalendarItem {
  id: string;
  itemType: 'RETURN' | 'RENEWAL';
  title: string;
  clientId: string;
  branchId: string | null;
  branchName?: string | null;
  dueDate: string;
  status: string;
  subLabel?: string | null;
  proofPending?: boolean;
  returnType?: string | null;
  registrationName?: string | null;
  lawType?: string | null;
}

export interface ClientComplianceSummary {
  totalReturns: number;
  verifiedReturns: number;
  filedPendingProof: number;
  overdueReturns: number;
  totalRenewals: number;
  verifiedRenewals: number;
  overdueRenewals: number;
  upcomingDueIn7Days: number;
}

export interface ReminderNotificationItem {
  id: string;
  module: 'RETURNS' | 'RENEWALS';
  title: string;
  message: string;
  dueDate: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  entityId: string;
  entityType: 'RETURN_TASK' | 'EXPIRY_TASK';
  branchName?: string | null;
  itemType?: 'RETURN' | 'RENEWAL';
}

export interface ComplianceTaskFilters {
  clientId?: string | null;
  branchId?: string | null;
  status?: string | null;
  lawType?: string | null;
  returnType?: string | null;
  periodYear?: number | null;
  periodMonth?: number | null;
  frequency?: string | null;
  searchTerm?: string | null;
  pendingOnly?: boolean;
}
