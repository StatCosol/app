export const KIOSK_FAILURE_DETAILS: Record<string, string> = {
  NO_MATCH: 'No enrolled face was recognised. Check enrolment and retry with a clear photo.',
  LIVENESS_FAILED: 'The liveness check did not pass. Look at the camera and blink, then retry.',
  NO_FACE: 'No clear face was detected. Move closer and look at the camera.',
  FACE_NOT_DETECTED: 'No usable face photo was captured. Look at the camera and retry.',
  NO_FACE_IN_PHOTO: 'No clear face was found in the photo. Move closer and retry.',
  LOW_CONFIDENCE: 'The face match was below the required confidence. Retry with a clear photo.',
  AMBIGUOUS_MATCH: 'More than one profile matched too closely. Ask your supervisor to review enrolment.',
  AMBIGUOUS: 'The scan could not distinguish between enrolled profiles. Ask your supervisor to review enrolment.',
  AZURE_UNAVAILABLE: 'Face recognition was unavailable. Try again shortly.',
  AZURE_ERROR: 'The face recognition service could not complete the check. Try again.',
  NOT_ENROLLED: 'Face enrolment is not active. Ask your supervisor to complete enrolment.',
  NO_ENROLLED: 'No active enrolled profile was found for this attempt.',
  ORPHAN_FACE: 'The recognised face has an incomplete enrolment record. Ask your supervisor to review it.',
  PIN_MISSING: 'No PIN was entered.',
  WRONG_PIN: 'The entered PIN did not match.',
  UNKNOWN_CODE: 'The entered employee code was not found.',
};

export function failureDetail(row: { reason: string; reasonDetail?: string | null }): string {
  return row.reasonDetail?.trim() || KIOSK_FAILURE_DETAILS[row.reason] || 'No additional detail was recorded for this attempt.';
}

export function failureScore(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'Not recorded';
  const score = Number(value);
  return Number.isFinite(score) ? (score * 100).toFixed(0) + '%' : 'Not recorded';
}
