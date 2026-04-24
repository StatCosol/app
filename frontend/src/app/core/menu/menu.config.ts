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
  { label: 'Digest', route: '/admin/digest', roles: ['ADMIN'] },
  { label: 'Reports', route: '/admin/reports', roles: ['ADMIN'] },
  { label: 'Risk Heatmap', route: '/admin/heatmap', roles: ['ADMIN'] },
  { label: 'SLA Tracker', route: '/admin/sla', roles: ['ADMIN'] },
  { label: 'Risk Trend', route: '/admin/risk-trend', roles: ['ADMIN'] },
  { label: 'Escalations', route: '/admin/escalations', roles: ['ADMIN'] },
  { label: 'Audit Logs', route: '/admin/audit-logs', roles: ['ADMIN'] },
  { label: 'Unassigned Clients', route: '/admin/governance/unassigned', roles: ['ADMIN'] },
  { label: 'Archive & Recovery', route: '/admin/archive', roles: ['ADMIN'] },
  { label: '🤖 AI Hub', route: '/admin/ai-hub', roles: ['ADMIN'] },

  // CCO
  { label: 'Dashboard', route: '/cco/dashboard', roles: ['CCO'] },
  { label: 'CRM Management', route: '/cco/crms-under-me', roles: ['CCO'] },
  { label: 'Approvals', route: '/cco/approvals', roles: ['CCO'] },
  { label: 'Oversight', route: '/cco/oversight', roles: ['CCO'] },
  { label: 'Escalations', route: '/cco/escalations', roles: ['CCO'] },
  { label: 'Registers', route: '/cco/registers', roles: ['CCO'] },
  { label: 'Notifications', route: '/cco/notifications', roles: ['CCO'] },
  { label: 'Reports', route: '/cco/crm-performance', roles: ['CCO'] },

  // CEO
  { label: 'Dashboard', route: '/ceo/dashboard', roles: ['CEO'] },
  { label: 'Approvals', route: '/ceo/approvals', roles: ['CEO'] },
  { label: 'Escalations', route: '/ceo/escalations', roles: ['CEO'] },
  { label: 'Oversight', route: '/ceo/oversight', roles: ['CEO'] },
  { label: 'Registers', route: '/ceo/registers', roles: ['CEO'] },
  { label: 'Notifications', route: '/ceo/notifications', roles: ['CEO'] },
  { label: 'Reports', route: '/ceo/reports', roles: ['CEO'] },

  // CRM
  { label: 'Dashboard', route: '/crm/dashboard', roles: ['CRM'] },
  { label: 'Clients', route: '/crm/clients', roles: ['CRM'] },
  { label: 'Compliance Tracker', route: '/crm/compliance-tracker', roles: ['CRM'] },
  { label: 'Returns / Filings', route: '/crm/returns', roles: ['CRM'] },
  { label: 'Schedule Audit', route: '/crm/audits', roles: ['CRM'] },
  { label: 'Helpdesk', route: '/crm/helpdesk', roles: ['CRM'] },
  { label: 'Reports', route: '/crm/reports', roles: ['CRM'] },
  { label: 'Compliance Calendar', route: '/crm/calendar', roles: ['CRM'] },
  { label: 'Risk Heatmap', route: '/crm/heatmap', roles: ['CRM'] },
  { label: 'SLA Tracker', route: '/crm/sla', roles: ['CRM'] },
  { label: 'Risk Trend', route: '/crm/risk-trend', roles: ['CRM'] },
  { label: 'Escalations', route: '/crm/escalations', roles: ['CRM'] },

  // AUDITOR (AuditXpert)
  { label: 'Dashboard', route: '/auditor/dashboard', roles: ['AUDITOR'] },
  { label: 'Audits', route: '/auditor/audits', roles: ['AUDITOR'] },
  { label: 'Observations', route: '/auditor/observations', roles: ['AUDITOR'] },
  { label: 'Reports', route: '/auditor/reports', roles: ['AUDITOR'] },
  { label: 'Notifications', route: '/auditor/notifications', roles: ['AUDITOR'] },

  // CLIENT (LegitX) — navigation handled by sidebar in client-layout

  // CONTRACTOR (ConTrack)
  { label: 'Dashboard', route: '/contractor/dashboard', roles: ['CONTRACTOR'] },
  { label: 'Tasks', route: '/contractor/tasks', roles: ['CONTRACTOR'] },
  { label: 'Compliance', route: '/contractor/compliance', roles: ['CONTRACTOR'] },
  { label: 'Notifications', route: '/contractor/notifications', roles: ['CONTRACTOR'] },
  { label: 'Support', route: '/contractor/support', roles: ['CONTRACTOR'] },

  // PF_TEAM
  { label: 'Dashboard', route: '/pf-team/dashboard', roles: ['PF_TEAM'] },
  { label: 'Tickets', route: '/pf-team/tickets', roles: ['PF_TEAM'] },

  // PAYROLL
  { label: 'Dashboard', route: '/payroll/dashboard', roles: ['PAYROLL'] },
  { label: 'Clients', route: '/payroll/clients', roles: ['PAYROLL'] },
  { label: 'Runs', route: '/payroll/runs', roles: ['PAYROLL'] },
  { label: 'Setup', route: '/payroll/setup', roles: ['PAYROLL'] },
  { label: 'Registers', route: '/payroll/registers', roles: ['PAYROLL'] },
];
