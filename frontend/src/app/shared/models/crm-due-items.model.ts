export type DueTab = 'OVERDUE' | 'DUE_SOON' | 'THIS_MONTH' | 'COMPLETED' | 'PENDING';
export type DueItemStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'OVERDUE';
export type DueCategory = 'RETURN' | 'RENEWAL' | 'AMENDMENT';

export interface DueItemRow {
  id: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  category: DueCategory;
  act: string;
  title: string;
  period?: string;
  dueDate: string;
  status: DueItemStatus;
  assigneeRole?: 'BRANCH' | 'CRM' | 'CLIENT';
  ownerAssigned?: string | null;
  lastReminderAt?: string | null;
  evidenceUrl?: string;
  remarks?: string;
  lastUpdatedAt: string;
}

export interface DueKpis {
  overdue: number;
  dueSoon: number;
  thisMonth: number;
  completed: number;
}
