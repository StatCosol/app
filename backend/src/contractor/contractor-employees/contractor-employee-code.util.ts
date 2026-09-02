/**
 * Contractor employee codes.
 *
 * Contractor workers had no readable identifier: `employee_code` exists on
 * contractor_employees but was only ever an optional input, so in practice it
 * was NULL. (It is not what identifies a punch — `punch_code`, the eSSL device
 * User ID, does that. This code is for payroll and reports.)
 *
 * The rule, as specified:
 *   - first letter of each word, up to three words
 *       "Sri Balaji Services"  -> SBS
 *   - on a collision with another contractor in the same client, the LAST
 *     character advances to the next letter of the final word, leaving the
 *     leading letters intact so the code still reads as that contractor
 *       "Sri Balaji Services"  -> SBE   (S, B, then "S-e-rvices")
 *       "Sri Balaji Solutions" -> SBO   (S, B, then "S-o-lutions")
 *
 * Two cases the rule did not cover, made explicit so they are easy to change:
 *   - Fewer than three words would give a prefix under three letters
 *     ("Reliance" -> "R"), too thin for a payslip. The remaining characters are
 *     taken from the final word, so "Reliance" -> REL, "Vedha Entech" -> VEN.
 *   - Repeated collisions keep advancing through the final word (SBS, SBE, SBR,
 *     SBV …) until its letters are exhausted.
 */

const NON_ALPHA = /[^A-Za-z]/g;

function words(name: string): string[] {
  return (name ?? '')
    .split(/\s+/)
    .map((w) => w.replace(NON_ALPHA, ''))
    .filter((w) => w.length > 0)
    .slice(0, 3);
}

/**
 * Prefix candidates for a contractor name, in priority order. The first is the
 * plain initials; each subsequent one advances the last character through the
 * final word.
 *
 * Returns an empty array for a name with no usable letters — callers must
 * handle that rather than emit a code with no prefix.
 */
export function contractorPrefixCandidates(name: string, size = 3): string[] {
  const parts = words(name);
  if (parts.length === 0) return [];

  const tail = parts[parts.length - 1];
  // Leading letters are the initials of every word bar the last, then the last
  // word supplies however many characters are still needed to reach `size`.
  const lead = parts
    .slice(0, -1)
    .map((w) => w[0])
    .join('');
  const fromTail = Math.max(1, size - lead.length);

  const candidates: string[] = [];
  // `start` is where the tail word is read from: 0 gives the plain initials,
  // 1 the first collision variant, and so on.
  for (let start = 0; start + fromTail <= tail.length; start += 1) {
    const code = (lead + tail.slice(start, start + fromTail)).toUpperCase();
    if (code.length === size && !candidates.includes(code)) {
      candidates.push(code);
    }
  }

  // Short names cannot fill `size` from the tail alone (e.g. "AB CD"): fall
  // back to whatever the initials give rather than returning nothing.
  if (candidates.length === 0) {
    const flat = parts.join('').toUpperCase();
    if (flat.length > 0) candidates.push(flat.slice(0, size));
  }
  return candidates;
}

/** Compose a full code from a resolved prefix and sequence number. */
export function formatContractorEmployeeCode(
  prefix: string,
  seq: number,
  width = 4,
): string {
  return `${prefix}${String(seq).padStart(width, '0')}`;
}
