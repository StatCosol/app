export interface SlaRule {
  id?: string;
  scope: string;
  priority: string;
  targetHours: number;
  escalationLevel1Hours: number;
  escalationLevel2Hours: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EscalationThreshold {
  id?: string;
  type: string;
  value: number;
  windowDays: number;
  severity: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReminderRule {
  id?: string;
  scope: string;
  daysBeforeDue: number;
  notifyRoles: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CcoControlsPayload {
  slaRules: SlaRule[];
  thresholds: EscalationThreshold[];
  reminders: ReminderRule[];
}
