import { Injectable } from '@nestjs/common';
import { Periodicity } from '../entities/enums';
import { AeComplianceMasterEntity } from '../entities/ae-compliance-master.entity';

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function halfYearStart(d: Date): Date {
  const h = d.getMonth() < 6 ? 0 : 6;
  return new Date(d.getFullYear(), h, 1);
}

function yearStart(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

@Injectable()
export class TaskGeneratorService {
  /**
   * Returns periodStart + dueDate for periodic compliance items.
   * Falls back to period-end as due date if no custom logic in taskTemplate.
   */
  getPeriodicSchedule(
    compliance: AeComplianceMasterEntity,
    now: Date,
  ): { periodStart: string; dueDate: string } | null {
    if (
      compliance.periodicity === Periodicity.AS_REQUIRED ||
      compliance.periodicity === Periodicity.EVENT
    ) {
      return null;
    }

    const tpl = compliance.taskTemplate ?? {};
    const dueDayOffset =
      typeof tpl.dueDayOffset === 'number' ? tpl.dueDayOffset : 0;

    let ps: Date;
    let due: Date;

    switch (compliance.periodicity) {
      case Periodicity.MONTHLY:
        ps = startOfMonth(now);
        due = endOfMonth(now);
        break;

      case Periodicity.QUARTERLY:
        ps = quarterStart(now);
        due = endOfMonth(new Date(ps.getFullYear(), ps.getMonth() + 2, 1));
        break;

      case Periodicity.HALF_YEARLY:
        ps = halfYearStart(now);
        due = endOfMonth(new Date(ps.getFullYear(), ps.getMonth() + 5, 1));
        break;

      case Periodicity.ANNUAL:
        ps = yearStart(now);
        due = endOfMonth(new Date(ps.getFullYear(), 11, 1));
        break;

      default:
        return null;
    }

    // Apply dueDayOffset (positive = extend past period end)
    if (dueDayOffset) {
      due = new Date(due.getTime());
      due.setDate(due.getDate() + dueDayOffset);
    }

    return { periodStart: toDateStr(ps), dueDate: toDateStr(due) };
  }

  /**
   * Generate reminder due-dates for license expiry.
   * leadDays: e.g. [60, 30, 15] means reminders at 60, 30, 15 days before expiry.
   */
  getExpiryReminderDates(expiry: Date, leadDays: number[]): string[] {
    return leadDays
      .map((ld) => {
        const d = new Date(expiry.getTime());
        d.setDate(d.getDate() - ld);
        return toDateStr(d);
      })
      .filter((ds) => ds >= toDateStr(new Date())); // skip past dates
  }
}
