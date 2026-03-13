/**
 * Script to improve Swagger @ApiOperation summaries by making them more descriptive.
 * Replaces generic summaries like "List" or "Create" with context-aware ones like "List all clients".
 */
const fs = require('fs');
const path = require('path');

function getEntityFromTag(filePath) {
  const rel = filePath.replace(/\\/g, '/').toLowerCase();

  // More specific matches first
  if (rel.includes('/admin/admin-actions')) return 'admin action';
  if (rel.includes('/admin/admin-approvals')) return 'admin approval';
  if (rel.includes('/admin/admin-audit-logs')) return 'audit log';
  if (rel.includes('/admin/admin-digest')) return 'admin digest';
  if (rel.includes('/admin/admin-list')) return 'admin list item';
  if (rel.includes('/admin/admin-masters')) return 'master data';
  if (rel.includes('/admin/admin-payroll-client-settings')) return 'payroll client setting';
  if (rel.includes('/admin/admin-payroll-templates')) return 'payroll template';
  if (rel.includes('/admin/admin-reports')) return 'admin report';
  if (rel.includes('/ai/')) return 'AI';
  if (rel.includes('/applicability/unit-acts')) return 'unit act';
  if (rel.includes('/applicability/')) return 'applicability rule';
  if (rel.includes('/assignments/assignment-rotation')) return 'assignment rotation';
  if (rel.includes('/assignments/')) return 'assignment';
  if (rel.includes('/attendance/')) return 'attendance record';
  if (rel.includes('/auditor/auditor-branches')) return 'auditor branch';
  if (rel.includes('/auditor/auditor-dashboard')) return 'auditor dashboard';
  if (rel.includes('/auditor/auditor-list')) return 'auditor list item';
  if (rel.includes('/audits/auditor-observations')) return 'audit observation';
  if (rel.includes('/audits/')) return 'audit';
  if (rel.includes('/branch-compliance/')) return 'branch compliance doc';
  if (rel.includes('/branches/branch-documents')) return 'branch document';
  if (rel.includes('/branches/branch-list')) return 'branch list item';
  if (rel.includes('/branches/branch-reports')) return 'branch report';
  if (rel.includes('/branches/branches-common')) return 'branch';
  if (rel.includes('/branches/client-branches')) return 'client branch';
  if (rel.includes('/branches/crm-branch-compliances')) return 'CRM branch compliance';
  if (rel.includes('/branches/crm-branches')) return 'CRM branch';
  if (rel.includes('/branches/')) return 'branch';
  if (rel.includes('/calendar/')) return 'calendar event';
  if (rel.includes('/cco/cco-controls')) return 'CCO control';
  if (rel.includes('/cco/cco-list')) return 'CCO list item';
  if (rel.includes('/cco/')) return 'CCO dashboard';
  if (rel.includes('/ceo/ceo-dashboard')) return 'CEO dashboard';
  if (rel.includes('/ceo/ceo-list')) return 'CEO list item';
  if (rel.includes('/ceo/')) return 'CEO';
  if (rel.includes('/checklists/')) return 'checklist';
  if (rel.includes('/cleanup/')) return 'archive';
  if (rel.includes('/client-dashboard/')) return 'client dashboard';
  if (rel.includes('/clients/admin-clients')) return 'client';
  if (rel.includes('/clients/cco-clients')) return 'CCO client';
  if (rel.includes('/clients/client-list')) return 'client list item';
  if (rel.includes('/clients/client.controller')) return 'client profile';
  if (rel.includes('/clients/')) return 'client';
  if (rel.includes('/common/compliance-pct')) return 'compliance percentage';
  if (rel.includes('/compliance-documents/')) return 'compliance document';
  if (rel.includes('/compliance/')) return 'compliance task';
  if (rel.includes('/compliances/branch-compliance-override')) return 'branch compliance override';
  if (rel.includes('/compliances/branch-compliance-recompute')) return 'branch compliance recompute';
  if (rel.includes('/compliances/branch-compliance')) return 'branch compliance';
  if (rel.includes('/compliances/compliance-metrics')) return 'compliance metric';
  if (rel.includes('/compliances/crm-compliance')) return 'CRM compliance';
  if (rel.includes('/compliances/')) return 'compliance';
  if (rel.includes('/contractor/client-contractors')) return 'client contractor';
  if (rel.includes('/contractor/contractor-documents')) return 'contractor document';
  if (rel.includes('/contractor/contractor-list')) return 'contractor list item';
  if (rel.includes('/contractor/contractor-required-documents')) return 'contractor required document';
  if (rel.includes('/contractor/crm-contractor-registration')) return 'CRM contractor registration';
  if (rel.includes('/contractor/')) return 'contractor';
  if (rel.includes('/crm-documents/')) return 'CRM unit document';
  if (rel.includes('/crm/crm-compliance-tracker')) return 'CRM compliance tracker';
  if (rel.includes('/crm/crm-contractor-documents')) return 'CRM contractor document';
  if (rel.includes('/crm/crm-dashboard')) return 'CRM dashboard';
  if (rel.includes('/crm/crm-list')) return 'CRM list item';
  if (rel.includes('/dashboard/admin-dashboard')) return 'admin dashboard';
  if (rel.includes('/employees/employee-bulk-import')) return 'employee bulk import';
  if (rel.includes('/employees/employee-document')) return 'employee document';
  if (rel.includes('/employees/master-data')) return 'employee master data';
  if (rel.includes('/employees/salary-revision')) return 'salary revision';
  if (rel.includes('/employees/')) return 'employee';
  if (rel.includes('/escalations/')) return 'escalation';
  if (rel.includes('/ess/')) return 'ESS';
  if (rel.includes('/files/')) return 'file';
  if (rel.includes('/helpdesk/')) return 'helpdesk ticket';
  if (rel.includes('/legitx/legitx-compliance-status')) return 'LegitX compliance status';
  if (rel.includes('/legitx/legitx-compliance')) return 'LegitX compliance';
  if (rel.includes('/legitx/legitx-dashboard')) return 'LegitX dashboard';
  if (rel.includes('/monthly-documents/')) return 'monthly document';
  if (rel.includes('/nominations/')) return 'nomination';
  if (rel.includes('/notifications/admin-notifications')) return 'admin notification';
  if (rel.includes('/notifications/notifications-inbox')) return 'notification inbox';
  if (rel.includes('/notifications/')) return 'notification';
  if (rel.includes('/options/')) return 'option';
  if (rel.includes('/payroll/engine/')) return 'payroll engine';
  if (rel.includes('/payroll/gratuity')) return 'gratuity';
  if (rel.includes('/payroll/paydek-list')) return 'paydek list item';
  if (rel.includes('/payroll/payroll-approval')) return 'payroll approval';
  if (rel.includes('/payroll/payroll-assignments')) return 'payroll assignment';
  if (rel.includes('/payroll/payroll-processing')) return 'payroll processing';
  if (rel.includes('/payroll/payroll-reports')) return 'payroll report';
  if (rel.includes('/payroll/payroll-setup')) return 'payroll setup';
  if (rel.includes('/payroll/payroll.config')) return 'payroll config';
  if (rel.includes('/payroll/payslip')) return 'payslip';
  if (rel.includes('/payroll/tds')) return 'TDS';
  if (rel.includes('/payroll/')) return 'payroll';
  if (rel.includes('/reports/assignment-report')) return 'assignment report';
  if (rel.includes('/reports/audit-report')) return 'audit report';
  if (rel.includes('/reports/compliance-report')) return 'compliance report';
  if (rel.includes('/reports/pdf-report')) return 'PDF report';
  if (rel.includes('/reports/report-export')) return 'report export';
  if (rel.includes('/reports/')) return 'report';
  if (rel.includes('/returns/admin-returns')) return 'admin return';
  if (rel.includes('/returns/auditor-returns')) return 'auditor return';
  if (rel.includes('/returns/client-returns')) return 'client return';
  if (rel.includes('/returns/crm-returns')) return 'CRM return';
  if (rel.includes('/risk/')) return 'risk';
  if (rel.includes('/safety-documents/')) return 'safety document';
  if (rel.includes('/sla/')) return 'SLA';
  if (rel.includes('/units/')) return 'unit';

  return 'item';
}

// Improve a summary based on the entity context
function improveSummary(currentSummary, entity) {
  const s = currentSummary.trim();

  // Already descriptive enough (has multiple words with context), keep as is
  if (s.split(' ').length >= 4) return s;

  // Known patterns to improve
  const lower = s.toLowerCase();
  const entityLower = entity.toLowerCase();
  const entityCapitalized = entity.charAt(0).toUpperCase() + entity.slice(1);

  // Map common generic method names to better summaries
  const genericPatterns = {
    'list': `List ${entityLower}s`,
    'find all': `List all ${entityLower}s`,
    'find one': `Get ${entityLower} by ID`,
    'get one': `Get ${entityLower} by ID`,
    'create': `Create a ${entityLower}`,
    'update': `Update a ${entityLower}`,
    'remove': `Remove a ${entityLower}`,
    'delete': `Delete a ${entityLower}`,
    'soft delete': `Soft delete a ${entityLower}`,
    'restore': `Restore a ${entityLower}`,
    'get': `Get ${entityLower}`,
    'get all': `Get all ${entityLower}s`,
    'get by id': `Get ${entityLower} by ID`,
  };

  for (const [pattern, replacement] of Object.entries(genericPatterns)) {
    if (lower === pattern) {
      return replacement;
    }
  }

  // If summary is a short verb phrase, add entity context
  if (s.split(' ').length <= 2 && !lower.includes(entityLower)) {
    return `${s} ${entityLower}`;
  }

  return s;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('@ApiOperation')) {
    return;
  }

  const entity = getEntityFromTag(filePath);

  // Replace each @ApiOperation({ summary: '...' }) with improved summary
  const updated = content.replace(
    /@ApiOperation\(\{\s*summary:\s*'([^']*)'\s*\}\)/g,
    (match, summary) => {
      const improved = improveSummary(summary, entity);
      return `@ApiOperation({ summary: '${improved}' })`;
    }
  );

  if (updated !== content) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log(`IMPROVED: ${path.basename(filePath)}`);
  }
}

// Find all controller files
function findControllers(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllers(fullPath));
    } else if (entry.name.endsWith('.controller.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcDir = path.join(__dirname, 'src');
const controllers = findControllers(srcDir);

for (const ctrl of controllers) {
  try {
    processFile(ctrl);
  } catch (err) {
    console.error(`ERROR: ${ctrl}: ${err.message}`);
  }
}

console.log('\nDone improving summaries!');
