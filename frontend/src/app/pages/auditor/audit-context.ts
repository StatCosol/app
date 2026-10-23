export function auditTypeLabel(value: unknown): string {
  const code = String(value || '').toUpperCase();
  const labels: Record<string, string> = {
    CONTRACTOR: 'Contractor audit', FACTORY: 'Factory audit', SAFETY: 'Safety audit',
    TRANSPORT: 'Transport audit', WAREHOUSE: 'Warehouse audit', E_MARKETING: 'E-marketing audit',
    OTHER: 'Other audit', SHOPS_ESTABLISHMENT: 'Shops & establishments audit',
    LABOUR_EMPLOYMENT: 'Labour law audit', FSSAI: 'FSSAI audit', HR: 'HR audit',
    PAYROLL: 'Payroll audit', GAP: 'Gap audit',
  };
  return labels[code] || (code ? code.replace(/_/g, ' ') : 'Audit type not specified');
}

export function auditContext(a: any) {
  a = a || {};
  const contractorAudit = String(a.auditType || a.audit_type || '').toUpperCase() === 'CONTRACTOR';
  const branch = a.branch?.branchName || a.branchName || a.branch_name;
  const contractor = a.contractorUser?.name || a.contractorName || a.contractor_name;
  return {
    code: a.auditCode || a.audit_code || 'Audit reference unavailable',
    client: a.client?.clientName || a.clientName || a.client_name || 'Client name unavailable',
    branch: branch || 'Branch not specified',
    type: auditTypeLabel(a.auditType || a.audit_type),
    period: a.periodCode || a.period_code || 'Period not specified',
    contractor: contractor || (contractorAudit ? 'Contractor not specified' : 'Not a contractor audit'),
    status: String(a.status || 'Not specified').replace(/_/g, ' '),
    warning: !branch || (contractorAudit && !contractor)
      ? `This audit does not identify ${[!branch ? 'a branch' : '', contractorAudit && !contractor ? 'a contractor' : ''].filter(Boolean).join(' or ')}. Confirm the intended scope with CRM before recording decisions; available documents may cover a wider client scope.` : '',
  };
}

export function auditOptionLabel(a: any): string {
  const c = auditContext(a);
  return [c.client, c.branch, c.type, c.period,
    ...(c.contractor === 'Not a contractor audit' ? [] : [c.contractor]), c.code].join(' · ');
}
