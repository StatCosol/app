/** Guidance for record-level workspaces; deliberately matches complete route segments. */
export function detailPagePurpose(url: string): {title: string; purpose: string} | undefined {
  const path = url.split(/[?#]/)[0].replace(/^\/app(?=\/)/, '').replace(/\/$/, '');
  const rules: [RegExp, string, string][] = [
    [/^\/(client|branch)\/employees\/new$/, 'Register an employee', 'Enter the employee details and select the correct branch before saving. Scheduled employment comes from the branch; the employee record holds the worker’s skill category.'],
    [/^\/(client|branch)\/employees\/[^/]+\/edit$/, 'Update employee details', 'Confirm the employee and branch, then review the fields you are changing before saving. Scheduled employment is maintained for the branch, not for each employee.'],
    [/^\/(client|branch)\/employees\/[^/]+$/, 'Review an employee record', 'Check the selected employee’s branch, employment details and supporting records. Use Edit to change permitted details and return to Employees to select another person.'],
    [/^\/branch\/audits\/[^/]+\/non-compliances$/, 'Corrective actions for this audit', 'Read each finding, add a response and attach correction evidence for auditor verification. Confirm the audit, branch and contractor before submitting.'],
    [/^\/contractor\/audits\/[^/]+\/non-compliances$/, 'Respond to this contractor audit', 'Review the findings for this audit, record your correction remarks and provide supporting evidence. Submitted corrections remain subject to auditor verification.'],
    [/^\/auditor\/audits\/[^/]+\/workspace$/, 'Conduct the selected audit', 'Confirm the client, branch, audit type and contractor where applicable. Review documents, record observations and site evidence, then prepare the report for submission.'],
    [/^\/auditor\/reports\/[^/]+\/builder$/, 'Prepare the selected audit report', 'Review observations, attachments and report content for this audit. Save your draft while working and submit the completed report for CRM review.'],
    [/^\/payroll\/clients\/[^/]+\/employees\/[^/]+$/, 'Employee payroll details', 'Confirm the client and employee before reviewing salary components and statutory eligibility. Changes to inputs must be reflected in the relevant payroll calculation and approval workflow.'],
    [/^\/client\/branches\/[^/]+\/applicability$/, 'Branch compliance applicability', 'Review the laws and requirements applicable to this branch using its location and establishment details. Check the scope before changing applicability.'],
    [/^\/client\/branches\/[^/]+\/compliance-items$/, 'Requirements for the selected branch', 'Review this branch’s assigned compliance requirements, due dates and evidence status. Open the relevant item to see the required submission or follow-up.'],
    [/^\/client\/branches\/[^/]+$/, 'Review the selected branch', 'Check this branch’s location, scheduled employment, registrations and assigned services. Confirm the branch before opening its records or editing permitted details.'],
    [/^\/client\/contractors\/branch\/[^/]+$/, 'Contractors for the selected branch', 'Review contractor assignments for this branch and open the relevant contractor record. Scheduled employment belongs to the contractor and skill categories belong to its workers.'],
    [/^\/client\/appraisals\/[^/]+$/, 'Review an employee appraisal', 'Check the selected employee, appraisal cycle and submitted assessment before recording your review decision. Confirm the record before approving or returning it.'],
    [/^\/branch\/appraisals\/[^/]+$/, 'Prepare an employee appraisal', 'Confirm the employee and appraisal cycle, enter the assessment and remarks, and review the completed form before submitting it for approval.'],
    [/^\/(client|branch|crm|auditor|contractor|payroll|cco)\/news(?:\/[^/]+)?$/, 'Read a compliance update', 'Read the selected update and its source publication. Check its date and applicability before using it to change a compliance requirement or payroll setting.'],
  ];
  const rule = rules.find(([pattern]) => pattern.test(path));
  return rule ? {title: rule[1], purpose: rule[2]} : undefined;
}

export function branchNavigationUrl(url: string): string {
  return url.replace(/^(\/app)?\/branch\/audits\/[^/?#]+\/non-compliances(?=[?#]|$)/, '$1/branch/audits/observations');
}
