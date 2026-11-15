import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { CrmService } from '../../core/crm.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type ModuleType = 'ALL' | 'REGISTRATION' | 'MCD' | 'RETURNS';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface CalendarDay {
  date: string;
  dayNum: number;
  isToday: boolean;
  items: any[];
}

@Component({
  selector: 'app-compliance-calendar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compliance-calendar.component.html',
  styleUrls: ['./compliance-calendar.component.scss'],
})
export class ComplianceCalendarComponent implements OnInit, OnDestroy {
  // ── Auth / role context ──
  roleCode = '';
  isCrm = false;

  // ── Client selector (CRM only) ──
  clients: { id: string; name: string }[] = [];
  selectedClientId = '';

  // ── Branch selector ──
  branches: { id: string; name: string }[] = [];
  selectedBranchId = '';

  // ── Filters ──
  module: ModuleType = 'ALL';
  month = '';

  // ── View toggle ──
  viewMode: 'grid' | 'list' = 'grid';

  // ── State ──
  loading = false;
  days: CalendarDay[] = [];
  allItems: any[] = [];
  loadError = '';
  calendarLoaded = false;
  clientLoadError = '';
  branchLoadError = '';
  private calendarRequest?: Subscription;
  private branchRequest?: Subscription;
  private clientRequest?: Subscription;

  private readonly destroy$ = new Subject<void>();
  private todayISO = '';

  constructor(
    private cdr: ChangeDetectorRef,
    private api: ClientBranchesService,
    private auth: AuthService,
    private crmService: CrmService,
    private crmClientsApi: CrmClientsApi,
  ) {}

  ngOnInit(): void {
    const now = new Date();
    this.todayISO = this.toISO(now);
    this.month = this.toYYYYMM(now);
    this.roleCode = this.auth.getRoleCode();
    this.isCrm = this.roleCode === 'CRM';

    if (this.isCrm) {
      this.initCrm();
    } else {
      this.initClient(true);
    }
  }

  ngOnDestroy(): void {
    this.calendarRequest?.unsubscribe();
    this.branchRequest?.unsubscribe();
    this.clientRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** CRM: load assigned clients first, then branches for selected client */
  private initCrm(): void {
    this.clientRequest?.unsubscribe();
    this.clientLoadError = '';
    this.clientRequest = this.crmService
      .getAssignedClientsCached()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (clients: any[]) => {
          this.clients = (clients || []).map((c) => ({
            id: c.id,
            name: c.clientName || c.name || 'Client',
          }));
          if (this.clients.length) {
            this.selectedClientId = this.clients[0].id;
            this.loadBranchesForClient();
          } else {
            this.clientLoadError = 'No assigned clients are available for this calendar.';
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.clients = [];
          this.clientLoadError = 'Clients could not be loaded. Retry to select a client.';
          this.cdr.markForCheck();
        },
      });
  }

  /** CLIENT / BRANCH: load branches from client portal */
  private initClient(resetScope = false): void {
    this.branchRequest?.unsubscribe();
    this.branchLoadError = '';
    const branchIds = this.auth.getBranchIds();

    if (branchIds?.length) {
      // Branch user — locked to their branches
      this.branches = branchIds.map((id) => ({ id, name: 'Branch' }));
      if (resetScope) this.selectedBranchId = branchIds[0];
      this.reload();
      this.branchRequest = this.api.list().pipe(takeUntil(this.destroy$)).subscribe({
        next: (b: any[]) => {
          const nameMap = new Map((b || []).map((x: any) => [x.id, x.branchName || x.name || 'Branch']));
          this.branches = branchIds.map((id) => ({ id, name: nameMap.get(id) || 'Branch' }));
          this.cdr.markForCheck();
        },
        error: () => {
          this.branchLoadError = 'Branch names could not be loaded. Retry to refresh the branch selector.';
          this.cdr.markForCheck();
        },
      });
    } else {
      // Master user — load all branches
      this.branchRequest = this.api
        .list()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (b: any[]) => {
            this.branches = (b || []).map((x) => ({
              id: x.id,
              name: x.branchName || x.name || 'Branch',
            }));
            this.cdr.markForCheck();
            this.reload();
          },
          error: () => {
            this.branchLoadError = 'Branches could not be loaded. Retry to load the calendar.';
            this.cdr.markForCheck();
          },
        });
    }
  }

  /** CRM: load branches for the selected client */
  loadBranchesForClient(resetScope = true): void {
    this.branchRequest?.unsubscribe();
    this.branchLoadError = '';
    if (resetScope) {
      this.branches = [];
      this.selectedBranchId = '';
      this.reload();
    }
    if (!this.selectedClientId) return;
    this.branchRequest = this.crmClientsApi
      .getBranchesForClient(this.selectedClientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (b) => {
          this.branches = (b || []).map((x) => ({
            id: x.id,
            name: x.branchName || 'Branch',
          }));
          this.cdr.markForCheck();
        },
        error: () => {
          this.branches = [];
          this.branchLoadError = 'Branches could not be loaded. Retry to refresh the branch selector.';
          this.cdr.markForCheck();
        },
      });
  }

  retryScopeOptions(): void {
    if (this.clientLoadError) this.initCrm();
    else if (this.isCrm) this.loadBranchesForClient(false);
    else this.initClient();
  }

  onClientChange(): void {
    this.loadBranchesForClient();
  }

  reload(): void {
    this.calendarRequest?.unsubscribe();
    this.allItems = [];
    this.days = [];
    this.calendarLoaded = false;
    this.loading = false;
    this.loadError = '';
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.loadError = 'Select a valid month to load compliance deadlines.';
      this.cdr.markForCheck();
      return;
    }
    if (this.isCrm && !this.selectedClientId) {
      this.loadError = 'Select a client to load compliance deadlines.';
      this.cdr.markForCheck();
      return;
    }
    const requestMonth = this.month;
    const [from, to] = this.monthRange(this.month);
    const mod = this.module === 'ALL' ? undefined : this.module;

    this.loading = true;
    this.cdr.markForCheck();

    const params: any = {
      from,
      to,
      branchId: this.selectedBranchId || undefined,
      module: mod,
    };

    // CRM/ADMIN users pass clientId
    if (this.isCrm && this.selectedClientId) {
      params.clientId = this.selectedClientId;
    }

    this.calendarRequest = this.api
      .getCalendar(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.allItems = res?.items || [];
          this.calendarLoaded = true;
          this.days = this.buildMonthCells(requestMonth, this.allItems);
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.allItems = [];
          this.days = [];
          this.loadError = 'Compliance deadlines could not be loaded. Retry before relying on this calendar.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ── UI helpers ──

  chipClass(item: any): string {
    const m = item.module;
    const p = (item.priority || 'MEDIUM') as Priority;
    const base =
      m === 'REGISTRATION'
        ? 'chip chip--reg'
        : m === 'MCD'
          ? 'chip chip--mcd'
          : m === 'RETURNS'
            ? 'chip chip--ret'
            : 'chip chip--sla';
    return `${base} chip--${p.toLowerCase()}`;
  }

  badgeClass(p: string): string {
    return `badge badge--${(p || 'MEDIUM').toLowerCase()}`;
  }

  get dayOfWeekHeaders(): string[] {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }

  get leadingBlanks(): null[] {
    if (!this.days.length) return [];
    const [y, m] = this.month.split('-').map(Number);
    const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
    const adjusted = firstDow === 0 ? 6 : firstDow - 1; // Mon=0
    return new Array(adjusted).fill(null);
  }

  get totalItems(): number {
    return this.allItems.length;
  }

  get criticalCount(): number {
    return this.allItems.filter((i) => i.priority === 'CRITICAL').length;
  }

  get highCount(): number {
    return this.allItems.filter((i) => i.priority === 'HIGH').length;
  }

  prevMonth(): void {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.month = this.toYYYYMM(new Date());
      this.reload();
      return;
    }
    const [y, m] = this.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    this.month = this.toYYYYMM(d);
    this.reload();
  }

  nextMonth(): void {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.month = this.toYYYYMM(new Date());
      this.reload();
      return;
    }
    const [y, m] = this.month.split('-').map(Number);
    const d = new Date(y, m, 1);
    this.month = this.toYYYYMM(d);
    this.reload();
  }

  // ── Private ──

  private monthRange(yyyyMM: string): [string, string] {
    const [y, m] = yyyyMM.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0);
    return [this.toISO(from), this.toISO(to)];
  }

  private buildMonthCells(yyyyMM: string, items: any[]): CalendarDay[] {
    const [y, m] = yyyyMM.split('-').map(Number);
    const last = new Date(y, m, 0);

    const map = new Map<string, any[]>();
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }

    const cells: CalendarDay[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(y, m - 1, d);
      const iso = this.toISO(dt);
      cells.push({
        date: iso,
        dayNum: d,
        isToday: iso === this.todayISO,
        items: map.get(iso) || [],
      });
    }
    return cells;
  }

  private toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private toYYYYMM(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
