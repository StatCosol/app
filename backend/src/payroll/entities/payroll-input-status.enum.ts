export enum PayrollInputStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PROCESSED = 'PROCESSED',
  ARCHIVED = 'ARCHIVED',
  CANCELLED = 'CANCELLED',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
  COMPLETED = 'COMPLETED',
  IN_PROGRESS = 'IN_PROGRESS',
}

export const PAYROLL_INPUT_STATUS_TRANSITIONS: Record<PayrollInputStatus, PayrollInputStatus[]> = {
  DRAFT: [PayrollInputStatus.SUBMITTED],
  SUBMITTED: [PayrollInputStatus.APPROVED, PayrollInputStatus.REJECTED, PayrollInputStatus.NEEDS_CLARIFICATION, PayrollInputStatus.COMPLETED, PayrollInputStatus.CANCELLED],
  APPROVED: [PayrollInputStatus.PROCESSED, PayrollInputStatus.ARCHIVED, PayrollInputStatus.COMPLETED],
  REJECTED: [PayrollInputStatus.DRAFT, PayrollInputStatus.ARCHIVED, PayrollInputStatus.CANCELLED],
  PROCESSED: [PayrollInputStatus.ARCHIVED, PayrollInputStatus.COMPLETED],
  ARCHIVED: [],
  CANCELLED: [],
  NEEDS_CLARIFICATION: [PayrollInputStatus.SUBMITTED, PayrollInputStatus.CANCELLED],
  COMPLETED: [],
  IN_PROGRESS: [PayrollInputStatus.COMPLETED],
};
