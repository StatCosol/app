/** One submission formula. Correction progress must never replace this assessment. */
export function observationScore(
  observations: Array<{ status: string; risk?: string | null }>,
) {
  const weights: Record<string, number> = {
    CRITICAL: 10,
    HIGH: 6,
    MEDIUM: 3,
    LOW: 1,
  };
  const breakdown = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: observations.length,
  };
  let demerits = 0;
  for (const observation of observations) {
    if (['RESOLVED', 'CLOSED'].includes(observation.status.toUpperCase()))
      continue;
    const risk = (observation.risk || 'LOW').toUpperCase();
    demerits += weights[risk] ?? 1;
    const key = (risk in weights ? risk : 'LOW').toLowerCase() as
      | 'critical'
      | 'high'
      | 'medium'
      | 'low';
    breakdown[key]++;
  }
  return { score: Math.max(0, 100 - demerits), breakdown };
}

export function submissionScore(
  observation: number,
  total: number,
  complied: number,
  fieldwork?: number | null,
) {
  const document =
    fieldwork ?? (total ? Math.round((complied / total) * 100) : 100);
  return { document, blended: Math.round((observation + document) / 2) };
}
