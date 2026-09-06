import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AuditsService } from '../../../core/audits.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';

interface RepeatNcItem {
  signature: string;
  documentName: string | null;
  occurrences: number;
  audits: number;
  lastSeenAt: string | null;
  maxRecurrenceCount: number | null;
}

@Component({
  selector: 'app-crm-repeat-nc-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LoadingSpinnerComponent,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header
      title="Repeat Non-Compliance Analytics"
      subtitle="Findings recurring across multiple audits for a client"
    ></ui-page-header>

    <div class="p-6 space-y-6">
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <label class="block text-xs font-semibold text-slate-600 uppercase mb-2">
          Client
        </label>
        <div class="flex flex-wrap gap-3 items-center">
          <select
            [(ngModel)]="clientId"
            (ngModelChange)="onClientChange()"
            class="border border-slate-300 rounded-md px-3 py-2 text-sm min-w-[280px]"
          >
            <option value="">— Select a client —</option>
            @for (c of clients; track c) {
<option [value]="c.client_id">
              {{ c.client_name }} ({{ c.total_audits || 0 }} audits)
            </option>
}
          </select>
          <button
            type="button"
            (click)="reload()"
            [disabled]="!clientId || loading"
            class="px-4 py-2 bg-brand-600 text-white text-sm rounded-md disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      @if (loading) {
<ui-loading-spinner></ui-loading-spinner>
}

      @if (!loading && !clientId) {
<div>
        <ui-empty-state
          message="Pick a client above to view recurring findings."
          icon="search"
        ></ui-empty-state>
      </div>
}

      @if (!loading && clientId && items.length === 0 && !error) {
<div>
        <ui-empty-state
          message="No recurring findings detected for this client."
          icon="check-circle"
        ></ui-empty-state>
      </div>
}

      @if (error) {
<div class="bg-rose-50 border border-rose-200 text-rose-700 rounded-md p-3 text-sm">
        {{ error }}
      </div>
}

      @if (!loading && items.length > 0) {
<div class="space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Repeat groups</span>
            <p class="text-2xl font-bold text-slate-800">{{ items.length }}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Total occurrences</span>
            <p class="text-2xl font-bold text-amber-600">{{ totalOccurrences }}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Audits affected</span>
            <p class="text-2xl font-bold text-rose-600">{{ maxAuditsAffected }}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="table-wrap"><table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left">Document</th>
                <th class="px-4 py-3 text-left">Finding signature</th>
                <th class="px-4 py-3 text-center">Audits</th>
                <th class="px-4 py-3 text-center">Occurrences</th>
                <th class="px-4 py-3 text-center">Max recurrence</th>
                <th class="px-4 py-3 text-left">Last seen</th>
              </tr>
            </thead>
            <tbody>
              @for (it of items; track it) {
<tr
               
                class="border-b border-slate-100 hover:bg-slate-50"
              >
                <td class="px-4 py-3 font-medium text-slate-800">
                  {{ it.documentName || '—' }}
                </td>
                <td class="px-4 py-3 text-slate-600 font-mono text-xs">
                  {{ it.signature }}
                </td>
                <td class="px-4 py-3 text-center">{{ it.audits }}</td>
                <td class="px-4 py-3 text-center text-amber-700 font-semibold">
                  {{ it.occurrences }}
                </td>
                <td class="px-4 py-3 text-center">
                  {{ it.maxRecurrenceCount ?? '—' }}
                </td>
                <td class="px-4 py-3 text-slate-500">
                  {{ it.lastSeenAt ? (it.lastSeenAt | date: 'mediumDate') : '—' }}
                </td>
              </tr>
}
            </tbody>
          </table></div>
        </div>
      </div>
}
    </div>
  `,
})
export class CrmRepeatNcAnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = false;
  error: string | null = null;
  clientId = '';
  clients: Array<{ client_id: string; client_name: string; total_audits?: number }> = [];
  items: RepeatNcItem[] = [];

  constructor(
    private readonly audits: AuditsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadClients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalOccurrences(): number {
    return this.items.reduce((sum, it) => sum + (it.occurrences || 0), 0);
  }

  get maxAuditsAffected(): number {
    return this.items.reduce((m, it) => Math.max(m, it.audits || 0), 0);
  }

  loadClients(): void {
    this.audits
      .crmGetAuditSummaries()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([] as any[])),
      )
      .subscribe((rows) => {
        this.clients = (rows || [])
          .map((r) => ({
            client_id: r.client_id,
            client_name: r.client_name,
            total_audits: r.total_audits,
          }))
          .filter((c) => !!c.client_id)
          .sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));
        this.cdr.markForCheck();
      });
  }

  onClientChange(): void {
    if (this.clientId) this.reload();
    else {
      this.items = [];
      this.error = null;
      this.cdr.markForCheck();
    }
  }

  reload(): void {
    if (!this.clientId) return;
    this.loading = true;
    this.error = null;
    this.audits
      .auditorRepeatNcAnalytics(this.clientId)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          this.error =
            err?.error?.message ||
            err?.message ||
            'Failed to load repeat-NC analytics.';
          return of({ items: [] as RepeatNcItem[] });
        }),
      )
      .subscribe((res: any) => {
        this.items = (res?.items || []) as RepeatNcItem[];
        this.loading = false;
        this.cdr.markForCheck();
      });
  }
}
