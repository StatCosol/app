/**
 * Common enums for dashboard tabs and filters
 */

export const CRM_DUE_TAB = ['OVERDUE', 'DUE_SOON', 'THIS_MONTH'] as const;
export type CrmDueTab = (typeof CRM_DUE_TAB)[number];

export const AUDIT_TAB = [
  'ACTIVE',
  'OVERDUE',
  'DUE_SOON',
  'COMPLETED',
] as const;
export type AuditorAuditTab = (typeof AUDIT_TAB)[number];

export const NOTIFICATION_STATUS = ['UNREAD', 'READ', 'CLOSED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

export const OBSERVATION_STATUS = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUS)[number];

export const RISK_LEVEL = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type RiskLevel = (typeof RISK_LEVEL)[number];

export const REPORT_STATUS = ['PENDING_SUBMISSION', 'SUBMITTED'] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];
