import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SlaComplianceResolverService } from '../compliances/sla-compliance-resolver.service';
import {
  SlaComplianceScheduleService,
} from '../compliances/sla-compliance-schedule.service';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Runs daily at 2:30 AM. Scans all active branches and auto-creates SLA tasks from:
 *  1) Registrations expiring within 60 days (or already expired)
 *  2) Compliance Master rules (MCD, Returns, etc.) resolved per-branch state/type
 */
@Injectable()
export class SlaAutogenCronService {
  private readonly logger = new Logger(SlaAutogenCronService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly resolver: SlaComplianceResolverService,
    private readonly schedule: SlaComplianceScheduleService,
  ) {}

  @Cron('0 30 2 * * *') // 2:30 AM daily
  async runDaily(): Promise<void> {
    this.logger.log('SLA auto-generation started...');

    const branches: { id: string; clientid: string }[] = await this.ds.query(
      `SELECT id, clientid FROM client_branches
       WHERE isdeleted = false AND status = 'ACTIVE'`,
    );

    let created = 0;
    for (const b of branches) {
      try {
        const c = await this.generateForBranch(b.clientid, b.id);
        created += c;
      } catch (err: unknown) {
        this.logger.warn(
          `SLA autogen failed for branch ${b.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `SLA auto-generation complete: ${created} tasks upserted across ${branches.length} branches.`,
    );
  }

  // ──────────────────────────────────────────────
  private async generateForBranch(
    clientId: string,
    branchId: string,
  ): Promise<number> {
    const today = this.startOfDay(new Date());
    let count = 0;

    count += await this.generateRegistrationTasks(clientId, branchId, today);
    count += await this.generateComplianceTasks(clientId, branchId, today);

    return count;
  }

  // ── REGISTRATIONS ──────────────────────────────
  private async generateRegistrationTasks(
    clientId: string,
    branchId: string,
    today: Date,
  ): Promise<number> {
    const regs: { id: string; type: string; expiry_date: string }[] = await this.ds.query(
      `SELECT id, type, expiry_date
       FROM branch_registrations
       WHERE client_id = $1 AND branch_id = $2
         AND status <> 'DELETED'
         AND expiry_date IS NOT NULL`,
      [clientId, branchId],
    );

    let count = 0;
    for (const r of regs) {
      const exp = this.startOfDay(new Date(r.expiry_date));
      const days = this.daysBetween(today, exp);

      // Only act within 60-day window or already expired
      if (days > 60) continue;

      const priority: Priority =
        days < 0
          ? 'CRITICAL'
          : days <= 7
            ? 'HIGH'
            : days <= 30
              ? 'MEDIUM'
              : 'LOW';

      const dueDate = days < 0 ? this.toISODate(today) : this.toISODate(exp);
      const title =
        days < 0
          ? `Renew expired registration: ${r.type}`
          : `Renew registration before expiry: ${r.type}`;
      const sourceKey = `REG:${r.id}`;

      const ok = await this.upsertSla(
        clientId,
        branchId,
        'REGISTRATION',
        r.id,
        sourceKey,
        title,
        priority,
        dueDate,
      );
      if (ok) count++;
    }
    return count;
  }

  // ── COMPLIANCE MASTER (resolver-based, state-specific) ──
  private async generateComplianceTasks(
    clientId: string,
    branchId: string,
    today: Date,
  ): Promise<number> {
    const y = today.getFullYear();
    const m = today.getMonth();
    const month = `${y}-${String(m + 1).padStart(2, '0')}`;
    let count = 0;

    // Resolve applicable rules for this branch (state/type specificity)
    const { applicable } = await this.resolver.getApplicableRules(branchId);

    // Build schedule for current month
    const entries = this.schedule.buildMonthSchedule({
      applicable,
      month,
    });

    // Also check next month for items with due_month_offset
    const nextM = m + 1 > 11 ? 0 : m + 1;
    const nextY = m + 1 > 11 ? y + 1 : y;
    const nextMonth = `${nextY}-${String(nextM + 1).padStart(2, '0')}`;
    const nextEntries = this.schedule.buildMonthSchedule({
      applicable,
      month: nextMonth,
    });

    const allEntries = [...entries, ...nextEntries];

    for (const entry of allEntries) {
      // ── Returns due tasks: create N days before due ──
      if (entry.dueDate && entry.module === 'RETURNS') {
        const due = new Date(entry.dueDate);
        const rule = applicable.find((x) => x.rule.id === entry.ruleId)?.rule;
        const createBeforeDays = rule?.createBeforeDays ?? 5;

        const createDate = new Date(due);
        createDate.setDate(due.getDate() - createBeforeDays);

        if (this.isSameDay(today, this.startOfDay(createDate))) {
          const ok = await this.upsertSla(
            clientId,
            branchId,
            'RETURNS',
            null,
            `${entry.code}:${entry.dueDate}`,
            entry.name,
            entry.priority as Priority,
            entry.dueDate,
          );
          if (ok) count++;
        }
      }

      // ── MCD window: create on open day + reminder 2 days before close ──
      if (entry.windowOpen && entry.windowClose && entry.module === 'MCD') {
        const openDate = new Date(entry.windowOpen);
        const closeDate = new Date(entry.windowClose);

        // Create on window open day
        if (this.isSameDay(today, this.startOfDay(openDate))) {
          const ok = await this.upsertSla(
            clientId,
            branchId,
            'MCD',
            null,
            `${entry.code}:${month}:OPEN`,
            `${entry.name} – opens`,
            entry.priority as Priority,
            entry.windowClose,
          );
          if (ok) count++;
        }

        // Reminder 2 days before close
        const reminderDate = new Date(closeDate);
        reminderDate.setDate(closeDate.getDate() - 2);
        if (this.isSameDay(today, this.startOfDay(reminderDate))) {
          const ok = await this.upsertSla(
            clientId,
            branchId,
            'MCD',
            null,
            `${entry.code}:${month}:REMINDER`,
            `${entry.name} – closing soon`,
            this.escalatePriority(entry.priority as Priority),
            entry.windowClose,
          );
          if (ok) count++;
        }
      }
    }

    return count;
  }

  /** Check if two dates are the same calendar day */
  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  /** Bump priority one level up for reminders */
  private escalatePriority(p: Priority): Priority {
    switch (p) {
      case 'LOW':
        return 'MEDIUM';
      case 'MEDIUM':
        return 'HIGH';
      case 'HIGH':
        return 'CRITICAL';
      default:
        return 'CRITICAL';
    }
  }

  // ── UPSERT (raw SQL with ON CONFLICT avoidance) ─
  private async upsertSla(
    clientId: string,
    branchId: string,
    module: string,
    entityId: string | null,
    sourceKey: string,
    title: string,
    priority: Priority,
    dueDate: string,
  ): Promise<boolean> {
    // Check if non-CLOSED task already exists for this source_key + due_date
    const existing: { id: string; status: string }[] = await this.ds.query(
      `SELECT id, status FROM sla_tasks
       WHERE client_id = $1 AND branch_id = $2
         AND module = $3 AND source_key = $4 AND due_date = $5
         AND deleted_at IS NULL
       LIMIT 1`,
      [clientId, branchId, module, sourceKey, dueDate],
    );

    if (existing.length > 0) {
      // Update title/priority if not CLOSED
      if (existing[0].status !== 'CLOSED') {
        await this.ds.query(
          `UPDATE sla_tasks SET title = $1, priority = $2, entity_id = $3, updated_at = NOW()
           WHERE id = $4`,
          [title, priority, entityId, existing[0].id],
        );
      }
      return false; // not a new creation
    }

    await this.ds.query(
      `INSERT INTO sla_tasks (client_id, branch_id, module, entity_id, source_key, title, priority, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
      [
        clientId,
        branchId,
        module,
        entityId,
        sourceKey,
        title,
        priority,
        dueDate,
      ],
    );
    return true;
  }

  // ── Date helpers ────────────────────────────────
  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private daysBetween(a: Date, b: Date): number {
    return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  private toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
