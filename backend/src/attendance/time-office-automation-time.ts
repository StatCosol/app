import { addCalendarDays } from '../common/operational-date';

export function automaticReminderDue(
  date: string,
  now: Date,
  shift?: { start_time: string; end_time: string; grace_out_min: number },
): boolean {
  let due = new Date(`${addCalendarDays(date, 1)}T09:00:00+05:30`).getTime();
  if (shift) {
    const endDate =
      shift.end_time <= shift.start_time ? addCalendarDays(date, 1) : date;
    const end = new Date(`${endDate}T${shift.end_time}+05:30`).getTime();
    // Allow the overnight shift, punch grace and a two-hour import buffer to finish.
    due = Math.max(
      due,
      end + (Number(shift.grace_out_min || 0) + 120) * 60_000,
    );
  }
  return Number.isFinite(due) && now.getTime() >= due;
}
