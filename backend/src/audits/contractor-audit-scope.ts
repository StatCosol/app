import { BadRequestException } from '@nestjs/common';
export function contractorScopeReadiness(audit: {
  auditType: string;
  branchId?: string | null;
  contractorUserId?: string | null;
}) {
  if (audit.auditType !== 'CONTRACTOR') return [];
  return [
    {
      key: 'branch_scope_linked',
      label: 'Branch selected',
      ok: !!audit.branchId?.trim(),
      hint: audit.branchId
        ? 'Branch mapping available'
        : 'Select one branch for this contractor audit',
    },
    {
      key: 'contractor_scope_linked',
      label: 'Contractor selected',
      ok: !!audit.contractorUserId?.trim(),
      hint: audit.contractorUserId
        ? 'Contractor mapping available'
        : 'Select one contractor for this audit',
    },
  ];
}
export function assertContractorAuditScope(
  auditType: string,
  branchId?: string | null,
  contractorUserId?: string | null,
): void {
  if (
    auditType === 'CONTRACTOR' &&
    (!branchId?.trim() || !contractorUserId?.trim())
  ) {
    throw new BadRequestException(
      'Select a branch and contractor for each contractor audit. All-branch work must use separate branch-contractor audits. Ask CRM to correct this scope before starting.',
    );
  }
}
