import { ConflictException } from '@nestjs/common';

/** Drafts, rejected corrections and legacy in-progress work remain editable. */
export function assertPayrollRunEditable(run: { status: string }): void {
  if (
    !['DRAFT', 'PROCESSED', 'REJECTED', 'IN_PROGRESS'].includes(
      String(run.status).toUpperCase(),
    )
  ) {
    throw new ConflictException(
      'Payroll run is locked. Submitted runs require a CCO rejection; approved runs must be reverted to DRAFT before changing inputs or recalculating.',
    );
  }
}
