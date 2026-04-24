/**
 * Canonical role identifiers for the platform.
 * Used with @Roles() decorator for type-safe RBAC.
 */
export enum AppRole {
  ADMIN = 'ADMIN',
  CEO = 'CEO',
  CCO = 'CCO',
  CRM = 'CRM',
  AUDITOR = 'AUDITOR',
  CLIENT = 'CLIENT',
  /** Virtual role — CLIENT user with userType=BRANCH */
  BRANCH_DESK = 'BRANCH_DESK',
  CONTRACTOR = 'CONTRACTOR',
  PAYROLL = 'PAYROLL',
  PF_TEAM = 'PF_TEAM',
  EMPLOYEE = 'EMPLOYEE',
}
