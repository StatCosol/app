/**
 * Validate that a remarks string meets minimum length requirements.
 * Throws if too short — use in CRM approval/reject flows.
 */
export function requireRemarks(
  remarks: string | null | undefined,
  minLen = 5,
): string {
  const r = (remarks || '').trim();
  if (r.length < minLen) {
    throw new Error(`Remarks required (min ${minLen} chars).`);
  }
  return r;
}
