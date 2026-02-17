import { MenuItem } from './menu.model';

export const APP_MENUS: MenuItem[] = [
  // ADMIN
  { label: 'Dashboard', route: '/admin/dashboard', roles: ['ADMIN'] },
  { label: 'Users', route: '/admin/users', roles: ['ADMIN'] },
  { label: 'Clients', route: '/admin/clients', roles: ['ADMIN'] },
  { label: 'Assignments', route: '/admin/assignments', roles: ['ADMIN'] },
  { label: 'Masters', route: '/admin/masters', roles: ['ADMIN'] },
  { label: 'Payroll Assignments', route: '/admin/payroll-assignments', roles: ['ADMIN'] },
  { label: 'Notifications', route: '/admin/notifications', roles: ['ADMIN'] },
  { label: 'Reports', route: '/admin/reports', roles: ['ADMIN'] },

  // CCO
  { label: 'Dashboard', route: '/cco/dashboard', roles: ['CCO'] },
  { label: 'CRM Management', route: '/cco/crms-under-me', roles: ['CCO'] },
  { label: 'Approvals', route: '/cco/approvals', roles: ['CCO'] },
  { label: 'Escalations', route: '/cco/oversight', roles: ['CCO'] },
  { label: 'Notifications', route: '/cco/notifications', roles: ['CCO'] },
  { label: 'Reports', route: '/cco/crm-performance', roles: ['CCO'] },

  // CEO
  { label: 'Dashboard', route: '/ceo/dashboard', roles: ['CEO'] },
  { label: 'Approvals', route: '/ceo/approvals', roles: ['CEO'] },
  { label: 'Escalations', route: '/ceo/escalations', roles: ['CEO'] },
  { label: 'Oversight', route: '/ceo/oversight', roles: ['CEO'] },
  { label: 'Notifications', route: '/ceo/notifications', roles: ['CEO'] },
  { label: 'Reports', route: '/ceo/reports', roles: ['CEO'] },

  // CRM
  { label: 'Dashboard', route: '/crm/dashboard', roles: ['CRM'] },
  { label: 'Clients', route: '/crm/clients', roles: ['CRM'] },
  { label: 'Compliance Tracker', route: '/crm/compliance-tracker', roles: ['CRM'] },
  { label: 'Schedule Audit', route: '/crm/audits', roles: ['CRM'] },
  { label: 'Helpdesk', route: '/crm/helpdesk', roles: ['CRM'] },
  { label: 'Notifications', route: '/crm/notifications', roles: ['CRM'] },
  { label: 'Reports', route: '/crm/reports', roles: ['CRM'] },

  // AUDITOR (AuditXpert)
  { label: 'Dashboard', route: '/auditor/dashboard', roles: ['AUDITOR'] },
  { label: 'Audits', route: '/auditor/audits', roles: ['AUDITOR'] },
  { label: 'Compliance', route: '/auditor/compliance', roles: ['AUDITOR'] },

  // CLIENT (LegitX) — navigation handled by sidebar in client-layout

  // CONTRACTOR (ConTrack)
  { label: 'Dashboard', route: '/contractor/dashboard', roles: ['CONTRACTOR'] },
  { label: 'Tasks', route: '/contractor/tasks', roles: ['CONTRACTOR'] },
  { label: 'Compliance', route: '/contractor/compliance', roles: ['CONTRACTOR'] },
  { label: 'Notifications', route: '/contractor/notifications', roles: ['CONTRACTOR'] },
  { label: 'Support', route: '/contractor/support', roles: ['CONTRACTOR'] },

  // PAYROLL
  { label: 'Dashboard', route: '/payroll/dashboard', roles: ['PAYROLL'] },
  { label: 'Clients', route: '/payroll/clients', roles: ['PAYROLL'] },
  { label: 'Runs', route: '/payroll/runs', roles: ['PAYROLL'] },
  { label: 'Registers', route: '/payroll/registers', roles: ['PAYROLL'] },
];
