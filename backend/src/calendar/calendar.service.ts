import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SlaComplianceResolverService } from '../compliances/sla-compliance-resolver.service';
import { SlaComplianceScheduleService } from '../compliances/sla-compliance-schedule.service';

type ModuleType = string;
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface CalendarItem {
  date: string;
  title: string;
  module: ModuleType;
  priority: Priority;
  branchId: string | null;
  branchName: string | null;
  entityId: string | null;
  meta: Record<string, unknown>;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly resolver: SlaComplianceResolverService,
    private readonly schedule: SlaComplianceScheduleService,
  ) {}

  async getCalendar(params: {
    clientId: string;
    branchIds: string[];
    from: string;
    to: string;
    branchId?: string;
    module?: ModuleType;
  }): Promise<{ from: string; to: string; items: CalendarItem[] }> {
    const { clientId, branchIds, from, to, branchId, module } = params;

    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    // Determine effective branch filter
    // If user is branch-scoped, ensure they only see their own branches
    let filterBranchIds: string[] | null = null;
    if (branchId) {
      // Specific branch requested — verify it's in their allowed set (if they have one)
      if (branchIds.length > 0 && !branchIds.includes(branchId)) {
        return { from, to, items: [] };
      }
      filterBranchIds = [branchId];
    } else if (branchIds.length > 0) {
      filterBranchIds = branchIds;
    }

    const items: CalendarItem[] = [];

    // ── 1) Registrations expiry ──
    if (!module || module === 'REGISTRATION') {
      const regItems = await this.fetchRegistrations(
        clientId,
        filterBranchIds,
        start,
        end,
      );
      items.push(...regItems);
    }

    // ── 2) Compliance-driven items (MCD, Returns, etc.) from compliance_rules ──
    if (!module || module !== 'REGISTRATION') {
      const complianceItems = await this.buildComplianceItems(
        clientId,
        filterBranchIds,
        start,
        end,
        module || null,
      );
      items.push(...complianceItems);
    }

    // Attach branch names
    const uniqueBranchIds = [
      ...new Set(items.map((i) => i.branchId).filter(Boolean)),
    ] as string[];

    if (uniqueBranchIds.length) {
      const rows: { id: string; branchname: string }[] = await this.ds.query(
        `SELECT id, branchname FROM client_branches WHERE clientid = $1 AND id = ANY($2::uuid[])`,
        [clientId, uniqueBranchIds],
      );
      const nameMap = new Map(rows.map((r) => [r.id, r.branchname]));
      for (const item of items) {
        if (item.branchId) {
          item.branchName = nameMap.get(item.branchId) || item.branchId;
        }
      }
    }

    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return { from, to, items };
  }

  // ── Registration expiry items ──
  private async fetchRegistrations(
    clientId: string,
    branchIds: string[] | null,
    start: Date,
    end: Date,
  ): Promise<CalendarItem[]> {
    let sql = `
      SELECT r.id, r.type, r.registration_number, r.authority,
             r.expiry_date, r.branch_id, r.status
      FROM branch_registrations r
      WHERE r.client_id = $1
        AND r.status <> 'DELETED'
        AND r.expiry_date IS NOT NULL
        AND r.expiry_date BETWEEN $2 AND $3
    `;
    const params: unknown[] = [clientId, start, end];

    if (branchIds?.length) {
      params.push(branchIds);
      sql += ` AND r.branch_id = ANY($${params.length}::uuid[])`;
    }

    const rows: { id: string; type: string; registration_number: string | null; authority: string | null; expiry_date: string; branch_id: string; status: string }[] = await this.ds.query(sql, params);
    const now = new Date();

    return rows.map((r) => {
      const daysRemaining = this.daysBetween(now, new Date(r.expiry_date));
      return {
        date: this.toISODate(r.expiry_date),
        title: `${r.type}${r.registration_number ? ` (${r.registration_number})` : ''} expiry`,
        module: 'REGISTRATION' as ModuleType,
        priority: this.regPriority(daysRemaining),
        branchId: r.branch_id,
        branchName: null,
        entityId: r.id,
        meta: {
          daysRemaining,
          authority: r.authority || null,
          status: r.status,
        },
      };
    });
  }

  // ── Compliance-driven calendar items (resolver-based, state-specific) ──
  private async buildComplianceItems(
    clientId: string,
    branchIds: string[] | null,
    start: Date,
    end: Date,
    moduleFilter: string | null,
  ): Promise<CalendarItem[]> {
    const items: CalendarItem[] = [];

    // Fetch branch IDs to process
    let branchSql = `SELECT id FROM client_branches
                     WHERE clientid = $1 AND isdeleted = false AND status = 'ACTIVE'`;
    const branchParams: unknown[] = [clientId];
    if (branchIds?.length) {
      branchParams.push(branchIds);
      branchSql += ` AND id = ANY($${branchParams.length}::uuid[])`;
    }
    const branchRows: { id: string }[] = await this.ds.query(branchSql, branchParams);

    // Get months in range
    const months = this.monthsBetween(start, end);

    for (const row of branchRows) {
      const bid: string = row.id;

      // Resolve applicable rules for this branch (state/type specificity)
      let applicable;
      try {
        const result = await this.resolver.getApplicableRules(bid);
        applicable = result.applicable;
      } catch (e) {
        this.logger.warn(
          `Calendar: skipping branch ${bid}, rule resolution failed`,
          (e as Error)?.message,
        );
        continue; // branch not found or error — skip
      }

      for (const month of months) {
        const entries = this.schedule.buildMonthSchedule({
          applicable,
          month,
        });

        for (const s of entries) {
          // Apply module filter
          if (moduleFilter && s.module !== moduleFilter) continue;

          // Due-day items
          if (s.dueDate) {
            const dt = new Date(s.dueDate);
            if (dt < start || dt > end) continue;

            items.push({
              date: s.dueDate,
              title: s.name,
              module: s.module,
              priority: s.priority as Priority,
              branchId: bid,
              branchName: null,
              entityId: null,
              meta: { code: s.code, ruleId: s.ruleId },
            });
          }

          // Window items
          if (s.windowOpen && s.windowClose) {
            const openDt = new Date(s.windowOpen);
            const closeDt = new Date(s.windowClose);

            if (openDt >= start && openDt <= end) {
              items.push({
                date: s.windowOpen,
                title: `${s.name} – Opens`,
                module: s.module,
                priority: s.priority as Priority,
                branchId: bid,
                branchName: null,
                entityId: null,
                meta: { code: s.code, ruleId: s.ruleId, window: 'OPEN' },
              });
            }

            if (closeDt >= start && closeDt <= end) {
              items.push({
                date: s.windowClose,
                title: `${s.name} – Closes`,
                module: s.module,
                priority: this.escalatePriority(s.priority as Priority),
                branchId: bid,
                branchName: null,
                entityId: null,
                meta: { code: s.code, ruleId: s.ruleId, window: 'CLOSE' },
              });
            }
          }
        }
      }
    }

    return items;
  }

  /** Build YYYY-MM list for a date range */
  private monthsBetween(start: Date, end: Date): string[] {
    const out: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const lim = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= lim) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      out.push(`${y}-${m}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }

  /** Bump priority one level for window-close events */
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

  // ── Helpers ──
  private regPriority(daysRemaining: number): Priority {
    if (daysRemaining < 0) return 'CRITICAL';
    if (daysRemaining <= 7) return 'HIGH';
    if (daysRemaining <= 30) return 'MEDIUM';
    return 'LOW';
  }

  private daysBetween(a: Date, b: Date): number {
    return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  private toISODate(d: string | Date): string {
    const dt = new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
