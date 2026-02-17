export enum PayrollInputStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const PAYROLL_INPUT_STATUS_TRANSITIONS: Record<
  PayrollInputStatus,
  PayrollInputStatus[]
> = {
  [PayrollInputStatus.DRAFT]: [
    PayrollInputStatus.SUBMITTED,
    PayrollInputStatus.CANCELLED,
  ],
  [PayrollInputStatus.SUBMITTED]: [
    PayrollInputStatus.IN_PROGRESS,
    PayrollInputStatus.NEEDS_CLARIFICATION,
    PayrollInputStatus.REJECTED,
    PayrollInputStatus.APPROVED,
    PayrollInputStatus.CANCELLED,
  ],
  [PayrollInputStatus.IN_PROGRESS]: [
    PayrollInputStatus.NEEDS_CLARIFICATION,
    PayrollInputStatus.APPROVED,
    PayrollInputStatus.REJECTED,
    PayrollInputStatus.COMPLETED,
  ],
  [PayrollInputStatus.NEEDS_CLARIFICATION]: [
    PayrollInputStatus.SUBMITTED,
    PayrollInputStatus.IN_PROGRESS,
    PayrollInputStatus.REJECTED,
    PayrollInputStatus.APPROVED,
    PayrollInputStatus.CANCELLED,
  ],
  [PayrollInputStatus.APPROVED]: [PayrollInputStatus.COMPLETED],
  [PayrollInputStatus.REJECTED]: [
    PayrollInputStatus.SUBMITTED,
    PayrollInputStatus.CANCELLED,
  ],
  [PayrollInputStatus.COMPLETED]: [],
  [PayrollInputStatus.CANCELLED]: [],
};
