import { detailPagePurpose } from './detail-page-purpose';
import { activeNavigationRoute } from './active-route';

export interface PagePurpose { title: string; purpose: string; }
const guides: Record<string, PagePurpose> = {};
function add(role: string, entries: Record<string, [string, string]>): void {
  for (const [route, [title, purpose]] of Object.entries(entries)) guides[`/${role}/${route}`] = { title, purpose };
}
for (const role of ['client', 'crm', 'auditor', 'contractor', 'payroll', 'cco']) {
  add(role, {
    'my-work': ['Your action queue', 'Find work assigned to you, check due dates and open the relevant record to complete the next action.'],
    'profile': ['Your account details', 'Review your account and contact information. Access to clients and services is controlled by your assigned role.'],
    'notifications': ['Updates requiring your attention', 'Read workflow updates and open the related record for its current status and available actions.'],
  });
}
add('client', {
  'dashboard': ['Company compliance overview', 'Review the status of your subscribed services across branches, then open the relevant workspace for details and actions.'],
  'monthly-close': ['Review the month before closure', 'Check monthly readiness and outstanding items for the selected branch and period before completing the review.'],
  'compliance/status': ['Compliance progress across branches', 'See which obligations are complete, pending or overdue. Use Upload Status to check whether the supporting documents have been submitted.'],
  'branch-compliance': ['Check document submission progress', 'Compare branch upload status for the selected period and identify missing evidence. Use Compliance Status to review the underlying obligations.'],
  'safety': ['Workplace safety records', 'Review safety requirements, inspections and supporting evidence for the selected branch. Check open actions and their completion status.'],
  'compliance/returns': ['Return filings and acknowledgements', 'Review statutory returns by branch and filing period, including submission details and supporting acknowledgements.'],
  'returns-summary': ['Compare filing progress', 'Review an overview of return filings across branches and periods. Open Returns / Filings for individual submissions and evidence.'],
  'returns-status': ['Track filing completion', 'Check the status of individual return obligations for the selected branch and period, and identify pending or overdue filings.'],
  'compliance/registrations': ['Registration and licence records', 'Review registrations, validity dates and supporting certificates for each branch. Use Renewals for upcoming expiry and renewal work.'],
  'renewals': ['Renewal work and supporting evidence', 'Review renewal requests, expiry dates and supporting documents for the selected branch. Track each item through completion.'],
  'renewals-status': ['Monitor renewal completion', 'Compare pending and completed renewals by branch and period. Use Renewals to open the underlying work and documents.'],
  'compliance/mcd': ['Submit monthly compliance evidence', 'Choose the branch and month, then upload the documents required for that period. Follow review feedback when corrections are requested.'],
  'compliance/library': ['Compliance submission library', 'Find submitted compliance documents by branch and period and check their review status. Unit Documents holds branch-level records and certificates.'],
  'unit-documents': ['Branch records and certificates', 'Find documents belonging to a unit or branch, such as certificates and permanent records. Periodic compliance submissions are in Compliance Documents.'],
  'audits': ['Audit evidence and published reports', 'Select an audit and confirm its branch, audit type and contractor where applicable. Review required evidence and reports made available to your account.'],
  'audit-summaries': ['Compare audit results', 'Review audit outcomes across branches and audit types. Open Audits to see the individual audit, its evidence and available report.'],
  'calendar': ['Compliance dates and deadlines', 'See obligations by due date for the selected branch and period. Open the relevant workspace to submit evidence or complete the work.'],
  'reminders': ['Upcoming and overdue obligations', 'Review reminders for time-sensitive compliance work and follow up on outstanding actions before the due date.'],
  'heatmap': ['Where compliance risk is concentrated', 'Compare risk across branches and compliance areas to decide where follow-up is needed. Use Risk Trend to see changes over time.'],
  'risk-trend': ['How compliance risk changes over time', 'Compare risk across periods and branches. Use Risk Heatmap to see the current distribution and identify areas requiring attention.'],
  'sla': ['Service deadlines and delays', 'Check work against its service deadline and identify delays. Use Escalations to review issues requiring additional attention.'],
  'escalations': ['Issues requiring additional attention', 'Review escalated compliance issues, their owners and status. Open the related record to understand the action needed.'],
  'notices': ['Official notices and responses', 'Review notices for the selected branch, response deadlines and supporting documents. Track each notice through its response and closure.'],
  'payroll': ['Approved employee payroll', 'Review employee payroll and available payslips and reports for the selected period. Payroll preparation and processing are handled in PayDek.'],
  'contractor-payroll': ['Contractor payment cross-check', 'Compare contractor wage calculations with wage registers, bank proofs and bills for billing and audit review. This workspace does not issue contractor payslips.'],
  'interns': ['Intern records', 'Review intern details and their assignment to your branches. Keep joining, exit and contact information current.'],
  'employees': ['Employee records and classifications', 'Review employees, branch assignments and individual skill categories. Scheduled employment belongs to the branch; it is not an employee-level classification.'],
  'registers': ['Download available employee registers', 'Select the branch and period to find available employee payroll registers. Confirm the period before downloading or sharing a report.'],
  'attendance': ['Review attendance inputs', 'Check attendance summaries for the selected employees and period. Use Daily Attendance to inspect the underlying day-by-day records.'],
  'attendance/daily': ['Daily employee attendance', 'Review attendance for individual dates and employees. Check exceptions before the attendance is used in payroll.'],
  'holidays': ['Branch holiday calendar', 'Review holidays applicable to each branch and date. These records support attendance and payroll period review.'],
  'facedesk': ['Kiosk attendance workspace', 'Manage attendance capture through FaceDesk for enabled branches. Review attendance exceptions in Face Failures.'],
  'face-failures': ['Attendance capture exceptions', 'Review failed face attendance attempts and investigate the employee, device and time involved before correcting attendance.'],
  'biometric': ['Biometric attendance devices', 'Review devices and their branch assignments used for attendance capture. Check device status when attendance records are missing.'],
  'master-data': ['Workforce reference information', 'Review reference data used by your employee and payroll workflows. Confirm branch and classification details before making changes.'],
  'ctc-summary': ['Employee compensation overview', 'Review employee compensation totals and components. Use Payroll for approved period results and PayDek for payroll processing.'],
  'branches': ['Your units and branch details', 'Review branch locations, registrations and scheduled employment. These details determine which compliance and wage rules apply.'],
  'contractors': ['Contractors assigned to your company', 'Review contractor details and branch assignments. Contractor scheduled employment is maintained against the contractor, with skill categories on workers.'],
  'approvals': ['Requests awaiting your decision', 'Review the details and supporting evidence of each request before using the approval actions available to your role.'],
  'appraisal-dashboard': ['Appraisal progress overview', 'Review appraisal cycle progress and pending reviews. Open Appraisals for individual employee assessments.'],
  'appraisals': ['Employee performance reviews', 'Open an employee appraisal to review objectives, assessments and feedback within the selected review cycle.'],
  'appraisal-cycles': ['Appraisal review periods', 'Review the dates and status of appraisal cycles used to organise employee performance reviews.'],
  'appraisal-templates': ['Appraisal criteria and forms', 'Review reusable appraisal templates and their assessment criteria before using them in a review cycle.'],
  'appraisal-reports': ['Appraisal results and summaries', 'Compare appraisal outcomes for the selected cycle and employees. Use Appraisals for the underlying reviews and feedback.'],
  'queries': ['Questions and service follow-up', 'Raise and track questions for the service team, including responses and supporting attachments for each query.'],
  'settings/access': ['Branch access settings', 'Review which functions branch users may access. Changes affect access to your company data and should match the intended responsibilities.'],
});
add('crm', {
  'dashboard': ['Assigned client overview', 'Review outstanding work and compliance progress for your assigned clients. Open a client or workspace to investigate individual records.'],
  'monthly-close': ['Monthly client readiness review', 'Check the selected client, branch and period for outstanding work before completing the monthly review.'],
  'clients': ['Client and branch workspace', 'Select an assigned client to review its branches, contractors and service configuration. Confirm the client before editing records.'],
  'helpdesk': ['Client queries and support', 'Review incoming queries, record responses and track resolution with the supporting information for each request.'],
  'compliance-tracker': ['Monitor compliance across clients', 'Compare completed, pending and overdue obligations. Use Compliance Tasks to work on individual requirements and Document Review Center to review uploads.'],
  'compliance/tasks': ['Work on compliance obligations', 'Select the client, branch and period, then review the requirement, assigned owner and supporting evidence for each task.'],
  'returns': ['Manage return filings', 'Review filing obligations, submission details and acknowledgement evidence for the selected client, branch and period.'],
  'registrations': ['Manage registrations and licences', 'Review registration details and certificates for assigned clients. Check validity dates and open renewal work when required.'],
  'branch-docs-review': ['Review submitted branch evidence', 'Inspect uploaded documents and record approval or correction feedback. This review status is separate from uploading the original file.'],
  'calendar': ['Compliance work by due date', 'Review deadlines for assigned clients and branches, then open the related work to complete the required action.'],
  'sla': ['Track service commitments', 'Review work against its service deadline and identify overdue items that need follow-up or escalation.'],
  'escalations': ['Resolve escalated issues', 'Review issues requiring additional attention, their ownership and status. Check the underlying evidence before recording a resolution.'],
  'expiry-tasks': ['Identify expiring records', 'Find registrations and documents approaching expiry. Use Renewals Workspace to manage the renewal work and evidence.'],
  'renewals': ['Manage renewal work', 'Review renewal details, supporting documents and progress for the selected client and branch. Confirm validity dates when work is completed.'],
  'amendments': ['Changes to existing registrations', 'Track amendment requests and supporting evidence where an existing registration needs a change rather than a new application or renewal.'],
  'notices': ['Manage notices and responses', 'Review official notices, response deadlines and evidence for assigned clients. Track the response and closure of each notice.'],
  'minimum-wages': ['Applicable minimum wage rates', 'Review rates by state, scheduled employment, zone, skill and effective period. Use official source evidence before changing a rate.'],
  'contractor-computation': ['Contractor wages for billing and audit', 'Cross-check contractor wage calculations, attendance and payment evidence. These calculations support reconciliation and do not issue contractor payslips.'],
  'quotation-comparison': ['Compare contractor quotations', 'Compare proposed rates and costs using the same assumptions. Quotation estimates are separate from actual payroll and payment reconciliation.'],
  'audits': ['Schedule, review and publish audits', 'Confirm the client, branch, audit type and contractor before reviewing an audit. Review submitted reports and handle corrections before publication.'],
  'audit-monitoring': ['Monitor audit execution', 'Track audit progress and outstanding findings across assigned clients. Use Audits for scheduling, report review and publication actions.'],
  'audit-analytics/repeat-ncs': ['Repeated audit findings', 'Compare recurring non-compliances across audits to identify persistent issues. This analytics page is for review; corrections belong to the underlying audit.'],
  'reports': ['Client service reports', 'Select the relevant client and reporting period to review available reports. Confirm scope and status before downloading or sharing.'],
  'heatmap': ['Compare client compliance risk', 'Identify branches and compliance areas with concentrated risk. Use Risk Trend to compare the direction of change over time.'],
  'risk-trend': ['Review risk over time', 'Compare compliance risk between reporting periods and identify clients requiring follow-up. Use Risk Heatmap for the current distribution.'],
});
add('auditor', {
  'dashboard': ['Your audit workload', 'Review assigned audits, outstanding findings and deadlines. Select an audit scope before reviewing documents or recording results.'],
  'conduct-audit': ['Choose the audit you are conducting', 'Select the client, branch and audit type. For contractor audits, select the contractor or vendor to load the correct audit documents and checklist.'],
  'audits': ['Audits assigned to you', 'Open an assigned audit and confirm its client, branch, audit type and contractor before reviewing evidence and preparing the report.'],
  'contractor-payroll': ['Verify contractor payment evidence', 'Compare wage calculations with wage registers, bank proofs and contractor bills for the selected period. Record verification only where evidence supports it.'],
  'observations': ['Verify corrections to audit findings', 'Review responses and correction evidence against audit observations. Record verification or return the finding for further correction.'],
  'analytics/overdue-ncs': ['Findings past their due date', 'Identify overdue non-compliances and open the related audit finding to review its response, correction evidence and next action.'],
  'analytics/repeat-ncs': ['Recurring non-compliance patterns', 'Compare repeated findings across audits to identify persistent risks. Open the underlying audit for evidence and corrective action.'],
  'reports': ['Audit reports and review status', 'Review your draft and submitted reports, confirm their audit scope and check review feedback. Submission is followed by CRM review before publication.'],
  'ai-audit': ['Assisted audit analysis', 'Review suggested insights alongside the original evidence. Validate findings yourself before including them in an audit report.'],
});
add('contractor', {
  'dashboard': ['Your contractor compliance overview', 'Review pending submissions and assigned work across your client branches. Open the relevant task or audit to provide evidence.'],
  'tasks': ['Compliance tasks and document submissions', 'Review assigned compliance requirements, upload supporting documents and respond to correction requests. Select Audits for audit-specific work.'],
  'employees': ['Your workers and skill categories', 'Maintain worker details, skill categories and assignments. Scheduled employment belongs to the contractor and should match the actual work performed.'],
  'clra': ['Contract labour registration and licence evidence', 'Review CLRA requirements and supporting registration or licence records for your assignments. Confirm the client and branch for each record.'],
  'payroll-computation': ['Wage and payment cross-check', 'Review contractor wage calculations and supporting payment evidence used for billing and audit reconciliation. This is not a contractor payslip-generation service.'],
  'support': ['Contractor support requests', 'Raise questions and track responses about your assigned work, submissions or account, with relevant supporting information.'],
  'audits': ['Audit findings and corrective evidence', 'Review findings for the selected contractor audit and provide responses or correction evidence for the auditor to verify.'],
});
add('payroll', {
  'dashboard': ['PayDek processing overview', 'Review payroll workload and pending actions across assigned clients. Select a client before changing payroll inputs or processing a period.'],
  'clients': ['Select a payroll client', 'Choose an assigned client to open its employees, payroll setup, period processing and reports. Confirm the client before proceeding.'],
  'clients/:clientId/overview': ['Selected client payroll overview', 'Review payroll readiness and outstanding work for this client, then open the relevant setup, processing or reporting page.'],
  'clients/:clientId/employees': ['Employee payroll inputs', 'Review employee salary inputs, skill and statutory eligibility details. Confirm branch and employment information before recalculating payroll.'],
  'clients/:clientId/runs': ['Prepare and review a payroll period', 'Choose the period, check inputs and calculate payroll. Submit for the required approval before publishing employee payslips and reports.'],
  'clients/:clientId/pf-esi': ['PF and ESI payroll compliance', 'Review statutory contribution data for the selected client and period. Check eligibility and calculated amounts against the payroll results.'],
  'clients/:clientId/registers': ['Employee payroll registers', 'Select the client period to generate or download available registers. Confirm approval and publication status before sharing the output.'],
  'clients/:clientId/full-and-final': ['Employee exit settlement', 'Review exit details, outstanding earnings and deductions for an employee before completing the settlement workflow.'],
  'clients/:clientId/queries': ['Payroll questions and corrections', 'Review payroll queries for this client, record responses and track issues requiring input corrections or further review.'],
  'clients/:clientId/setup': ['Prepare payroll configuration', 'Review the client payroll setup and statutory settings used in calculations. Check applicable periods and rules before processing payroll.'],
  'clients/:clientId/rule-sets': ['Payroll calculation rules', 'Review the rules and effective periods used to calculate this client’s payroll. Confirm applicability before changing or selecting a rule set.'],
  'clients/:clientId/structures': ['Salary components and structures', 'Review reusable earnings and deduction structures used for employee salaries. Check component treatment before assigning a structure.'],
  'clients/:clientId/config': ['Client payroll settings', 'Review client-specific payroll settings and processing options. These settings affect subsequent payroll calculations and outputs.'],
  'tds-calculator': ['Estimate employee income tax', 'Compare tax estimates using the supplied income and deduction assumptions. This planning calculation is separate from an approved payroll run.'],
  'gratuity-calculator': ['Estimate gratuity', 'Calculate a gratuity estimate using the supplied service and wage details. Validate eligibility and inputs before using it in an exit settlement.'],
  'reports': ['Payroll reports across assigned clients', 'Choose the client and period to review available payroll reports. Confirm the scope and approval status before downloading or sharing.'],
});
add('cco', {
  'dashboard': ['Compliance leadership overview', 'Review pending decisions, service performance and risk across the teams and clients available to your role.'],
  'approvals': ['General approval requests', 'Review the details and evidence for each request before recording a decision. Payroll, service packages and audit actions have dedicated approval pages.'],
  'service-package-approvals': ['Review client service access changes', 'Check requested service-package changes and their effect on client access before approving or rejecting the request.'],
  'audit-action-approvals': ['Approve audit cancellation or deletion requests', 'Review the requested action, reason and audit status. CCO approval is required before the requested audit schedule action takes effect.'],
  'payroll-approvals': ['Independent payroll review', 'Review submitted payroll results and supporting details before approval or return for correction. Publication follows the required approval workflow.'],
  'oversight': ['Client and team compliance oversight', 'Review compliance execution and outstanding issues across your scope. Open individual records to investigate delays or exceptions.'],
  'crms-under-me': ['Your CRM team and assignments', 'Review the CRM team reporting to you and their client assignments. Use CRM Performance to compare delivery and workload.'],
  'crm-performance': ['CRM delivery and workload', 'Compare CRM performance and outstanding work to identify where follow-up is needed. Open the underlying records before making a decision.'],
  'escalations': ['Leadership attention and decisions', 'Review escalated issues, their evidence and current ownership. Record the appropriate next action within your approval responsibilities.'],
  'risk-heatmap': ['Risk across clients and teams', 'Compare compliance risk concentrations and prioritise follow-up. Investigate the underlying obligations and findings before closing an issue.'],
  'controls': ['Compliance controls and oversight settings', 'Review operational controls used in compliance oversight. Confirm the affected workflow and scope before changing a setting.'],
  'registers': ['Available compliance and payroll registers', 'Select the client and period to review available register outputs. Confirm scope and approval status before downloading or sharing.'],
});

add('crm', {
  'clients/:clientId/overview': ['Selected client workspace', 'Review this client’s branch coverage, services and outstanding work. Use the workspace tabs to open records within the selected client.'],
  'clients/:clientId/branches': ['Maintain this client’s branches', 'Review branch locations, scheduled employment and service assignments. Confirm the client and branch before adding or updating a record.'],
  'clients/:clientId/contractors': ['Manage this client’s contractors', 'Review contractor registrations and branch assignments. Maintain scheduled employment at contractor level and employee skills on individual worker records.'],
  'clients/:clientId/contractor-computation': ['Check contractor wages and payments', 'Review contractor wage calculations and reconcile supporting evidence for this client. These calculations support billing and audit checks, not contractor payslip generation.'],
  'clients/:clientId/quotation-comparison': ['Compare contractor quotations', 'Compare quotations within the selected client and branch scope. Check wage assumptions, coverage and supporting documents before recording a decision.'],
  'clients/:clientId/clra': ['Manage contract labour records', 'Review principal establishments, contractors, assignments and supporting licence records for this client. Confirm the branch and contractor before changing an assignment.'],
  'clients/:clientId/compliance-tracker': ['Track this client’s compliance work', 'Review assigned requirements, due dates and submission progress for the selected client. Open a requirement to inspect evidence and follow-up actions.'],
  'clients/:clientId/documents': ['Review this client’s documents', 'Find uploaded records for the selected client and branch. Check document scope, period and review status before opening or downloading a file.'],
  'clients/:clientId/compliance-docs': ['Review compliance submissions', 'Check this client’s submitted evidence and reviewer remarks. Approve sufficient evidence or return it with a clear correction request through the available review controls.'],
  'clients/:clientId/registrations': ['Manage this client’s registrations', 'Review registration and licence records, validity and pending requests. Confirm the branch and registration before updating details or following up.'],
  'clients/:clientId/payroll-status': ['Review this client’s payroll status', 'Check payroll processing and approval progress for the selected client and period. Payroll calculation and processing are managed centrally in PayDek.'],
  'clients/:clientId/unit-documents': ['Manage this client’s unit records', 'Review certificates, registrations and other unit documents by branch. Confirm the document category and branch before uploading or replacing a record.'],
  'clients/:clientId/safety': ['Review this client’s safety evidence', 'Check safety requirements, submitted records and open actions for the selected client and branch. Review evidence before recording the available verification decision.'],
});
export function portalPagePurpose(url: string): PagePurpose | undefined {
  const detail = detailPagePurpose(url);
  if (detail) return detail;
  const path = url.replace(/^\/app(?=\/)/, '').replace(/^(\/(?:payroll|crm)\/clients)\/[^/?#]+/, '$1/:clientId');
  if (/^\/contractor\/tasks(?:[/?#]|$)/.test(path) && new URLSearchParams((url.split('?')[1] || '').split('#')[0]).get('type') === 'AUDIT') {
    return {title: 'Assigned audit work and evidence', purpose: 'Review your assigned contractor audits, provide the requested documents and respond to correction requests. Confirm the client, branch and audit before submitting evidence.'};
  }
  const route = activeNavigationRoute(path, Object.keys(guides));
  return route ? guides[route] : undefined;
}
