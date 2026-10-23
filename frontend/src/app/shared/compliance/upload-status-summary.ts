export function uploadStatusSummary(rows: any[]) {
  const required = rows.filter(row => row.uploadRequired !== false && row.document?.status !== 'NOT_APPLICABLE');
  const uploaded = required.filter(row => !!row.document?.uploadedFileUrl && ['SUBMITTED','RESUBMITTED','APPROVED'].includes(row.document.status)).length;
  const approved = required.filter(row => !!row.document?.uploadedFileUrl && row.document.status === 'APPROVED').length;
  const returned = required.filter(row => row.document?.status === 'REUPLOAD_REQUIRED').length;
  return { total: required.length, uploaded, approved, returned,
    pending: required.filter(row => !row.document?.uploadedFileUrl || ['NOT_UPLOADED','OVERDUE'].includes(row.document.status)).length,
    review: required.filter(row => !!row.document?.uploadedFileUrl && ['SUBMITTED','RESUBMITTED'].includes(row.document.status)).length,
    percent: required.length ? Math.round(uploaded * 100 / required.length) : 0 };
}
