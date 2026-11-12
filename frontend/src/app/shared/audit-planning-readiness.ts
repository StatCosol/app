export interface AuditPlanningScope {
  auditType: string;
  branchId?: string | null;
  contractorUserId?: string | null;
}

export function contractorScopeReadiness(audit: AuditPlanningScope) {
  if (audit.auditType !== 'CONTRACTOR') return [];
  return [
    { label: 'Branch selected', ok: !!audit.branchId?.trim(), hint: audit.branchId ? 'Branch mapping available' : 'Select one branch for this contractor audit' },
    { label: 'Contractor selected', ok: !!audit.contractorUserId?.trim(), hint: audit.contractorUserId ? 'Contractor mapping available' : 'Select one contractor for this audit' },
  ];
}
