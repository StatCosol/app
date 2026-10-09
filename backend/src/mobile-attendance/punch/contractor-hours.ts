/** Normal contractor day includes breaks: 8 hours 30 minutes, not 8.30 decimal hours. */
export const CONTRACTOR_NORMAL_HOURS = 8.5;

export function contractorHours(
  start: Date | string | null,
  end: Date | string | null,
) {
  if (!start || !end) return null;
  const elapsed = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return null;
  return {
    hours: Number((elapsed / 36e5).toFixed(2)),
    otHours: Number(
      Math.max(0, elapsed / 36e5 - CONTRACTOR_NORMAL_HOURS).toFixed(2),
    ),
  };
}

export function contractorPunchPair<
  T extends { punchTime: Date | string; direction: string },
>(punches: T[]) {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime(),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // AUTO devices have no IN/OUT key; explicit repeated INs are not an exit.
  const inPunch =
    sorted.find((p) => p.direction === 'IN') ??
    (first?.direction === 'AUTO' ? first : null);
  const candidateOut =
    [...sorted].reverse().find((p) => p.direction === 'OUT') ??
    (sorted.length > 1 && last?.direction === 'AUTO' ? last : null);
  const finalIn = [...sorted].reverse().find((p) => p.direction === 'IN');
  // An earlier completed pair cannot close a later entry. Tied timestamps
  // cannot establish that the final entry was closed either.
  const outPunch =
    candidateOut &&
    (!finalIn ||
      new Date(candidateOut.punchTime).getTime() >
        new Date(finalIn.punchTime).getTime())
      ? candidateOut
      : null;
  return { inPunch, outPunch };
}
