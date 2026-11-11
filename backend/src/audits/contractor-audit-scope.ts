import { BadRequestException } from '@nestjs/common';
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
