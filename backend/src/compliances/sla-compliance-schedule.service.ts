import { Injectable } from '@nestjs/common';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ApplicableRule } from './sla-compliance-resolver.service';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ScheduleEntry {
  code: string;
  name: string;
  module: string;
  frequency: string;
  priority: Priority;
  dueDate?: string;
  windowOpen?: string;
  windowClose?: string;
  ruleId: string;
}

/**
 * Builds concrete calendar schedule entries for a given month
 * from the list of applicable compliance rules.
 *
 * Used by: Branch Compliance API, Calendar, SLA AutoGen.
 */
@Injectable()
export class SlaComplianceScheduleService {
  /**
   * For a given branch + applicable rules + month, produce schedule entries
   * with actual due dates / window dates resolved.
   */
  buildMonthSchedule(params: {
    branch: BranchEntity;
    applicable: ApplicableRule[];
    month: string; // "YYYY-MM"
  }): ScheduleEntry[] {
    const { applicable, month } = params;
    const [y, mm] = month.split('-').map(Number);
    const m = mm - 1; // JS 0-indexed month

    const out: ScheduleEntry[] = [];

    for (const ar of applicable) {
      const item = ar.item;
      const rule = ar.rule;
      const priority: Priority = (rule.priority ||
        item.defaultPriority ||
        'MEDIUM') as Priority;

      // ── Window-based items (MCD-style) ──
      if (rule.windowOpenDay && rule.windowCloseDay) {
        const open = new Date(y, m, rule.windowOpenDay);
        const close = new Date(y, m, rule.windowCloseDay);

        out.push({
          code: item.code,
          name: item.name,
          module: item.module,
          frequency: item.frequency,
          priority,
          windowOpen: this.toISO(open),
          windowClose: this.toISO(close),
          ruleId: rule.id,
        });
        continue;
      }

      // ── MONTHLY due-day ──
      if (item.frequency === 'MONTHLY' && rule.dueDay) {
        const dueMonth = m + (rule.dueMonthOffset || 0);
        const due = new Date(y, dueMonth, rule.dueDay);

        out.push({
          code: item.code,
          name: item.name,
          module: item.module,
          frequency: item.frequency,
          priority,
          dueDate: this.toISO(due),
          ruleId: rule.id,
        });
        continue;
      }

      // ── HALF_YEARLY due-month + due-day (TN PT-style) ──
      if (item.frequency === 'HALF_YEARLY' && rule.dueMonth && rule.dueDay) {
        const due = new Date(y, rule.dueMonth - 1, rule.dueDay);
        // Only include if the due date falls in the requested month
        if (due.getMonth() === m) {
          out.push({
            code: item.code,
            name: item.name,
            module: item.module,
            frequency: item.frequency,
            priority,
            dueDate: this.toISO(due),
            ruleId: rule.id,
          });
        }
        continue;
      }

      // ── YEARLY (future) — same pattern: due_month + due_day ──
      if (item.frequency === 'YEARLY' && rule.dueMonth && rule.dueDay) {
        const due = new Date(y, rule.dueMonth - 1, rule.dueDay);
        if (due.getMonth() === m) {
          out.push({
            code: item.code,
            name: item.name,
            module: item.module,
            frequency: item.frequency,
            priority,
            dueDate: this.toISO(due),
            ruleId: rule.id,
          });
        }
        continue;
      }
    }

    // Sort by due date / window open
    out.sort((a, b) => {
      const da = a.dueDate || a.windowOpen || '9999-12-31';
      const db = b.dueDate || b.windowOpen || '9999-12-31';
      return da < db ? -1 : da > db ? 1 : 0;
    });

    return out;
  }

  private toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
