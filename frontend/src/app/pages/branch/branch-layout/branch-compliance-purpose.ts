import { activeNavigationRoute } from '../../../shared/navigation/active-route';

export const BRANCH_COMPLIANCE_PURPOSE: Record<string, { title: string; purpose: string }> = {
  '/branch/compliance/status': { title: 'Compliance overview', purpose: 'Check completion, overdue work and pending reviews across your assigned branches. Open the relevant work page to upload evidence or respond to a reviewer.' },
  '/branch/compliance/monthly': { title: 'Monthly submissions', purpose: 'Choose a branch and month, upload the required monthly records, and track reviewer decisions. Use Periodic Uploads for quarterly, half-yearly and yearly submissions.' },
  '/branch/uploads': { title: 'Periodic submissions', purpose: 'Upload quarterly, half-yearly and yearly compliance records for your assigned branches. Choose the branch, frequency and period, then submit the file to CRM for review.' },
  '/branch/compliance-items': { title: 'Assigned requirements', purpose: 'Check which compliance items apply to your branch and their current status. Open an item to see the evidence or action required.' },
  '/branch/compliance': { title: 'Compliance requirements', purpose: 'Review assigned requirements and their submission status. Follow each item to its monthly or periodic upload workspace.' },
  '/branch/calendar': { title: 'Due dates and reminders', purpose: 'See upcoming and overdue compliance deadlines. Check the branch, due date and task before opening the relevant submission or follow-up.' },
  '/branch/registrations': { title: 'Registration requests and validity', purpose: 'Track branch registrations and licences, expiry dates and request progress. Request a new registration, renewal, amendment or closure and follow its review status.' },
  '/branch/safety': { title: 'Safety requirements and evidence', purpose: 'Review the safety requirements for your branch, upload supporting records and track verification. Select a requirement to see the latest file and reviewer feedback.' },
  '/branch/audits': { title: 'Audit evidence and published reports', purpose: 'Choose an audit to upload evidence, see verification remarks and open its published report. Use Audit Observations to respond to findings and submit corrective-action evidence.' },
  '/branch/audits/observations': { title: 'Corrective actions for audit findings', purpose: 'Read the auditor’s findings, record your response and attach evidence of the correction for verification. Audit reports and checklist uploads are available in Audit Reports & Evidence.' },
  '/branch/compliance-docs': { title: 'Submission review and corrections', purpose: 'Check review decisions for a branch and filing period. Read the reviewer’s notes, replace a returned document and resubmit it for review.' },
  '/branch/unit-documents': { title: 'Unit records shared with CRM and Client', purpose: 'Upload and retrieve branch registrations, licences, renewals, certificates and other unit records. Set the document category and scope so the right users can find it.' },
  '/branch/documents': { title: 'Branch document repository', purpose: 'Find existing branch files by category, upload status and branch. Use Monthly Compliance or Periodic Uploads to make a compliance submission, or Unit Documents to add a unit record.' },
  '/branch/compliance-library': { title: 'Compliance document library', purpose: 'Find compliance submissions and their review status by branch and period. Open the relevant submission workspace when a file needs correction.' },
  '/branch/notices': { title: 'Notices and replies', purpose: 'Track notices received for your branch, response deadlines and replies. Open a notice to review its details, supporting documents and follow-up status.' },
};

export function branchCompliancePurpose(url: string) {
  const route = activeNavigationRoute(url, Object.keys(BRANCH_COMPLIANCE_PURPOSE));
  return route ? BRANCH_COMPLIANCE_PURPOSE[route] : undefined;
}
