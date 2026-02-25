import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type ModuleType = 'REGISTRATION' | 'MCD' | 'RETURNS';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface CalendarItem {
  date: string;
  title: string;
  module: ModuleType;
  priority: Priority;
  branchId: string | null;
  branchName: string | null;
  entityId: string | null;
  meta: Record<string, any>;
}

@Injectable()
export class CalendarService {
  constructor(private readonly ds: DataSource) {}

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
      const regItems = await this.fetchRegistrations(clientId, filterBranchIds, start, end);
      items.push(...regItems);
    }

    // ── 2) MCD upload window (config-based, no DB table needed) ──
    if (!module || module === 'MCD') {
      items.push(...this.buildMcdWindowItems(from, to));
    }

    // ── 3) Returns due dates (config-based placeholders) ──
    if (!module || module === 'RETURNS') {
      items.push(...this.buildReturnItems(from, to));
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
    const params: any[] = [clientId, start, end];

    if (branchIds?.length) {
      params.push(branchIds);
      sql += ` AND r.branch_id = ANY($${params.length}::uuid[])`;
    }

    const rows: any[] = await this.ds.query(sql, params);
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

  // ── MCD upload window (20th–25th of each month) ──
  private buildMcdWindowItems(from: string, to: string): CalendarItem[] {
    const items: CalendarItem[] = [];
    const start = new Date(from);
    const end = new Date(to);

    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const limit = new Date(end.getFullYear(), end.getMonth() + 1, 0);

    while (cursor <= limit) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const open = new Date(y, m, 20);
      const close = new Date(y, m, 25);

      if (open >= start && open <= end) {
        items.push({
          date: this.toISODate(open),
          title: 'MCD Upload Window Opens (20th)',
          module: 'MCD',
          priority: 'MEDIUM',
          branchId: null,
          branchName: null,
          entityId: null,
          meta: { window: 'OPEN' },
        });
      }
      if (close >= start && close <= end) {
        items.push({
          date: this.toISODate(close),
          title: 'MCD Upload Window Closes (25th)',
          module: 'MCD',
          priority: 'HIGH',
          branchId: null,
          branchName: null,
          entityId: null,
          meta: { window: 'CLOSE' },
        });
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }
    return items;
  }

  // ── Returns / Filings reminders (config-based placeholders) ──
  private buildReturnItems(from: string, to: string): CalendarItem[] {
    const items: CalendarItem[] = [];
    const start = new Date(from);
    const end = new Date(to);

    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const limit = new Date(end.getFullYear(), end.getMonth() + 1, 0);

    while (cursor <= limit) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();

      const pushIfIn = (dt: Date, title: string, priority: Priority) => {
        if (dt >= start && dt <= end) {
          items.push({
            date: this.toISODate(dt),
            title,
            module: 'RETURNS',
            priority,
            branchId: null,
            branchName: null,
            entityId: null,
            meta: {},
          });
        }
      };

      pushIfIn(new Date(y, m, 15), 'PF Payment Due (15th)', 'HIGH');
      pushIfIn(new Date(y, m, 15), 'ESI Payment Due (15th)', 'HIGH');
      pushIfIn(new Date(y, m, 20), 'PT Payment Due (20th)', 'MEDIUM');

      cursor.setMonth(cursor.getMonth() + 1);
    }
    return items;
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

  private toISODate(d: any): string {
    const dt = new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
