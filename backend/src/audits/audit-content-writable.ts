/** A returned/reopened draft can be corrected without erasing its assessment. */
export function auditContentWritable(
  status: string,
  report?: { status: string; held_at?: unknown } | null,
) {
  const editable =
    [
      'PLANNED',
      'IN_PROGRESS',
      'CORRECTION_PENDING',
      'REVERIFICATION_PENDING',
    ].includes(status) ||
    (status === 'SUBMITTED' && report?.status === 'DRAFT');
  return (
    editable && (!report || (report.status === 'DRAFT' && !report.held_at))
  );
}
