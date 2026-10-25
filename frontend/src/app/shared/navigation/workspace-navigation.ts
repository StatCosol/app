export interface WorkspaceLink { label: string; route: string; description: string; module?: string; }
export interface WorkspaceNavigation { title: string; links: WorkspaceLink[]; }
const link = (label: string, route: string, description: string, module?: string): WorkspaceLink => ({label, route, description, module});
/** Related views retain their existing URLs, records and route guards. */
export function workspaceNavigation(url: string): WorkspaceNavigation | undefined {
 const path = url.split(/[?#]/)[0].replace(/^\/app(?=\/)/, '').replace(/\/$/, '');
 const compliance = 'EMPLOYEE_COMPLIANCE';
 const audit = 'CONTRACTOR_AUDIT';
 const groups: WorkspaceNavigation[] = [
  {title: 'Returns & Filings', links: [
   link('Filings', '/client/compliance/returns', 'Individual filings, uploads and acknowledgements', compliance),
   link('Status', '/client/returns-status', 'Branch filing queue and review status', compliance),
   link('Summary', '/client/returns-summary', 'Company-wide totals by law; all periods', compliance)]},
  {title: 'Registrations & Renewals', links: [
   link('Registrations', '/client/compliance/registrations', 'Registration records and certificates', compliance),
   link('Upcoming Expiries', '/client/renewals', 'Validity dates and expiry overview', compliance),
   link('Renewal Tasks', '/client/renewals-status', 'Assigned renewal work and completion', compliance)]},
  {title: 'Find the right document workspace', links: [
   link('Compliance Documents', '/client/compliance/library', 'Periodic submissions, review status and reference files', compliance),
   link('Unit Certificates', '/client/unit-documents', 'Branch certificates and permanent records', compliance),
   link('Safety Evidence', '/client/safety', 'Safety requirements and inspection records', compliance),
   link('Audit Evidence', '/client/audits', 'Documents attached to an assigned audit or checklist point', audit)]},
  {title: 'Find the right document workspace', links: [
   link('Branch Documents', '/branch/documents', 'Branch document register', compliance),
   link('Compliance Submissions', '/branch/compliance-docs', 'Required statutory evidence and corrections', compliance),
   link('Submission Library', '/branch/compliance-library', 'Submitted evidence and reference files', compliance),
   link('Unit Certificates', '/branch/unit-documents', 'Certificates and permanent records', compliance),
   link('Safety Evidence', '/branch/safety', 'Safety requirements and supporting records', compliance),
   link('Audit Evidence', '/branch/audits', 'Documents for assigned audit points and published reports', audit)]},
  {title: 'CRM daily work', links: [
   link('My Work', '/crm/my-work', 'Assigned actions and due dates'),
   link('Submission Review', '/crm/compliance-tracker', 'Review submissions in client context'),
   link('Branch Review', '/crm/branch-docs-review', 'Decide branch submission reviews'),
   link('Awaiting Reupload', '/crm/reupload-backlog', 'Outstanding corrections and ageing'),
   link('Expiry Tasks', '/crm/expiry-tasks', 'Work due for expiring registrations'),
   link('Monthly Closure', '/crm/monthly-close', 'Check a period before closure')]},
 ];
 const group = groups.find(g => g.links.some(l => l.route === path));
 if (group) return group;
 const crm = path.match(/^\/crm\/clients\/([^/]+)\/(documents|compliance-tracker|compliance-docs|unit-documents|safety)$/);
 if (crm) { const prefix = '/crm/clients/' + crm[1]; return {title: 'Client document workspaces', links: [
  link('Submission Review', prefix+'/compliance-tracker', 'Contractor documents and monthly compliance review'),
  link('Compliance Records', prefix+'/compliance-docs', 'Client statutory submissions and their status'),
  link('Unit Certificates', prefix+'/unit-documents', 'Branch certificates and permanent records'),
  link('Safety Evidence', prefix+'/safety', 'Safety requirements and inspection evidence')]}; }
 const payroll = path.match(/^\/payroll\/clients\/([^/]+)\/(setup|config|structures|rule-sets)$/);
 if (payroll) { const prefix = '/payroll/clients/' + payroll[1]; return {title: 'Payroll configuration', links: [
  link('Setup', prefix+'/setup', 'Client attendance, leave and payroll policies'),
  link('Configuration', prefix+'/config', 'Components, formulas and state statutory settings'),
  link('Salary Structures', prefix+'/structures', 'Reusable salary structures'),
  link('Rule Sets', prefix+'/rule-sets', 'Versioned payroll calculation rules')]}; }
 return undefined;
}
