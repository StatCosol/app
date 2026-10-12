import { addCalendarDays, validCalendarDate } from '../common/operational-date';

export function isFactoryLicence(type: string): boolean {
  return /\bfactor(?:y|ies)\b/i.test(type);
}

export function renewalPolicy(expiry: string, today: string) {
  if (!validCalendarDate(expiry) || !validCalendarDate(today)) {
    throw new Error('Invalid licence calendar date');
  }
  const daysRemaining = Math.round(
    (Date.parse(expiry + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) /
      86400000,
  );
  const daysToRenewal = daysRemaining - 30;
  return {
    expiryDate: expiry,
    renewalDueDate: addCalendarDays(expiry, -30),
    daysRemaining,
    daysToRenewal,
    status:
      daysRemaining < 0
        ? 'EXPIRED'
        : daysToRenewal < 0
          ? 'OVERDUE'
          : daysToRenewal === 0
            ? 'DUE_TODAY'
            : 'UPCOMING',
    priority:
      daysRemaining < 0 ? 'CRITICAL' : daysToRenewal <= 7 ? 'HIGH' : 'MEDIUM',
    visible: daysRemaining <= 60,
    // Start immediately on entering the current week, even if the 60-day scan was missed.
    reminderPeriod:
      daysToRenewal <= 0
        ? today
        : `week-${Math.floor((60 - daysRemaining) / 7)}`,
  };
}

export function manpowerPolicy(
  limit: number | null,
  onRoll: number,
  contractor: number,
) {
  const total = onRoll + contractor;
  return {
    licensedWorkerLimit: limit,
    onRoll,
    contractor,
    total,
    excess: limit === null ? null : Math.max(total - limit, 0),
    status:
      limit === null
        ? 'UNCONFIGURED'
        : total > limit
          ? 'BREACHED'
          : total === limit
            ? 'AT_LIMIT'
            : 'WITHIN_LIMIT',
  };
}
