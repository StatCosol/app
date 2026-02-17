export type RoleCode =
  | 'ADMIN'
  | 'CEO'
  | 'CCO'
  | 'CRM'
  | 'AUDITOR'
  | 'CLIENT'
  | 'CONTRACTOR'
  | 'PAYROLL';

export interface MenuItem {
  label: string;
  icon?: string;
  route: string;
  roles: RoleCode[];
}
