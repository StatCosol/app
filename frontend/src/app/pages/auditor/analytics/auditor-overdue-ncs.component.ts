import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AuditsService } from '../../../core/audits.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';

interface OverdueNc {
  ncId: string;
  auditId: string;
  auditCode: string | null;
  clientId: string;
  clientName: string | null;
  branchId: string | null;
  branchName: string | null;
  documentName: string | null;
  remark: string | null;
  status: string;
  vendorWindowUntil: string;
  requestedToRole: string | null;
  recurrenceCount: number | null;
  createdAt: string;
  daysOverdue: number;
}

@Component({
  selector: 'app-auditor-overdue-ncs',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header
      title="Overdue Non-Compliances"
      subtitle="Vendor closure window has elapsed without an acceptable correction"
    ></ui-page-header>

    <div class="p-6 space-y-4">
      <div class="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          (click)="reload()"
          [disabled]="loading"
          class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md disabled:opacity-50"
        >
          Refresh
        </button>
        @if (asOf) {
<span class="text-xs text-slate-500">
          As of {{ asOf | date: 'mediumDate' }} — {{ items.length }} item(s)
        </span>
}
      </div>

      @if (loading) {
<ui-loading-spinner></ui-loading-spinner>
}

      @if (!loading && items.length === 0 && !error) {
<div>
        <ui-empty-state
          message="No overdue non-compliances. Your audits are on track."
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
<div
           class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Audit</th>
              <th class="px-4 py-3 text-left">Client / Branch</th>
              <th class="px-4 py-3 text-left">Document</th>
              <th class="px-4 py-3 text-left">Finding</th>
              <th class="px-4 py-3 text-center">Status</th>
              <th class="px-4 py-3 text-center">Deadline</th>
              <th class="px-4 py-3 text-center">Days overdue</th>
              <th class="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (it of items; track it) {
<tr
             
              class="border-b border-slate-100 hover:bg-slate-50"
              [class.bg-rose-50]="it.daysOverdue >= 7"
            >
              <td class="px-4 py-3 font-mono text-xs text-slate-700">
                {{ it.auditCode || (it.auditId | slice: 0:8) }}
              </td>
              <td class="px-4 py-3 text-slate-700">
                <div class="font-medium">{{ it.clientName || '—' }}</div>
                <div class="text-xs text-slate-500">{{ it.branchName || '—' }}</div>
              </td>
              <td class="px-4 py-3 text-slate-800">{{ it.documentName || '—' }}</td>
              <td class="px-4 py-3 text-slate-600 max-w-xs truncate" [title]="it.remark || ''">
                {{ it.remark || '—' }}
              </td>
              <td class="px-4 py-3 text-center">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
                      [class.bg-amber-100]="it.status === 'NC_RAISED'"
                      [class.text-amber-800]="it.status === 'NC_RAISED'"
                      [class.bg-orange-100]="it.status === 'AWAITING_REUPLOAD'"
                      [class.text-orange-800]="it.status === 'AWAITING_REUPLOAD'">
                  {{ it.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-center text-slate-700">
                {{ it.vendorWindowUntil | date: 'mediumDate' }}
              </td>
              <td class="px-4 py-3 text-center font-bold"
                  [class.text-rose-700]="it.daysOverdue >= 7"
                  [class.text-amber-700]="it.daysOverdue < 7">
                {{ it.daysOverdue }}
              </td>
              <td class="px-4 py-3">
                <a
                  [routerLink]="['/auditor/audits', it.auditId, 'workspace']"
                  class="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
                >
                  Open audit →
                </a>
              </td>
            </tr>
}
          </tbody>
        </table></div>
      </div>
}
    </div>
  `,
})
export class AuditorOverdueNcsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = false;
  error: string | null = null;
  items: OverdueNc[] = [];
  asOf: string | null = null;

  constructor(
    private readonly audits: AuditsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    this.loading = true;
    this.error = null;
    this.audits
      .auditorListOverdueNcs()
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          this.error =
            err?.error?.message ||
            err?.message ||
            'Failed to load overdue non-compliances.';
          return of({ items: [] as OverdueNc[], asOf: null });
        }),
      )
      .subscribe((res: any) => {
        this.items = (res?.items || []) as OverdueNc[];
        this.asOf = res?.asOf || null;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }
}
