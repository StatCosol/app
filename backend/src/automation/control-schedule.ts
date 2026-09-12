import { operationalDate } from '../common/operational-date';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export interface AutomationOptions {
  packageId?: string;
  registrationDays?: number;
  documentDays?: number;
  taskDays?: number;
  auditDays?: number;
  escalationDays?: number;
  recipientIds?: string[];
}
export interface Schedule {
  frequency?: Frequency;
  week_day?: number;
  month_day?: number;
  local_time: string;
}
/** Current calendar period only; month-end dates clamp to the last real day. */
export function dueScheduleKey(
  schedule: Schedule,
  now = new Date(),
): string | null {
  const today = operationalDate(now);
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  if ((schedule.frequency || 'DAILY') === 'DAILY')
    return time >= schedule.local_time ? today : null;
  if (schedule.frequency === 'MONTHLY') {
    const target = Math.min(
      schedule.month_day || 1,
      new Date(Date.UTC(year, month, 0)).getUTCDate(),
    );
    return day > target || (day === target && time >= schedule.local_time)
      ? today.slice(0, 7)
      : null;
  }
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  const target = schedule.week_day ?? 0;
  date.setUTCDate(day - weekday);
  return weekday > target || (weekday === target && time >= schedule.local_time)
    ? date.toISOString().slice(0, 10)
    : null;
}
