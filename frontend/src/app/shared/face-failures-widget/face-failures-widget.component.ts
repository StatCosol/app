import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  ClientMobileAttendanceService,
  FailedScanStats,
} from '../../pages/client/mobile-attendance/client-mobile-attendance.service';

@Component({
  selector: 'app-face-failures-widget',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-slate-800">
          Face-scan failures (last 7 days)
        </h3>
        <a
          [routerLink]="route"
          class="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          View all →
        </a>
      </div>

      <ng-container *ngIf="!loading; else loadingTpl">
        <div *ngIf="stats; else emptyTpl" class="grid grid-cols-3 gap-3">
          <div class="rounded-lg bg-slate-50 p-3 text-center">
            <p class="text-2xl font-bold text-slate-800">{{ stats.total }}</p>
            <p class="text-[11px] text-slate-500 mt-0.5">Total failures</p>
          </div>
          <div class="rounded-lg bg-blue-50 p-3 text-center">
            <p class="text-2xl font-bold text-blue-700">
              {{ stats.bySubject.employee }}
            </p>
            <p class="text-[11px] text-slate-500 mt-0.5">Employees</p>
          </div>
          <div class="rounded-lg bg-amber-50 p-3 text-center">
            <p class="text-2xl font-bold text-amber-700">
              {{ stats.bySubject.contractor }}
            </p>
            <p class="text-[11px] text-slate-500 mt-0.5">Contractors</p>
          </div>
        </div>

        <div
          *ngIf="stats && topReason() as tr"
          class="mt-3 text-xs text-slate-600"
        >
          Top reason:
          <span class="font-medium text-slate-800" [title]="tr.reason">
            {{ tr.reason }}
          </span>
          <span class="text-slate-500"> ({{ tr.count }})</span>
        </div>

        <ng-template #emptyTpl>
          <p class="text-xs text-slate-400 py-3 text-center">
            No failure data
          </p>
        </ng-template>
      </ng-container>

      <ng-template #loadingTpl>
        <div class="py-4 flex justify-center">
          <div
            class="h-5 w-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"
          ></div>
        </div>
      </ng-template>
    </div>
  `,
})
export class FaceFailuresWidgetComponent implements OnInit {
  @Input() route = '/client/face-failures';

  loading = true;
  stats: FailedScanStats | null = null;

  constructor(
    private svc: ClientMobileAttendanceService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const from = `${this.toIsoDate(weekAgo)}T00:00:00.000Z`;
    const to = `${this.toIsoDate(today)}T23:59:59.999Z`;
    this.svc.failedScanStats({ from, to }).subscribe({
      next: (s) => {
        this.stats = s;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  topReason(): { reason: string; count: number } | null {
    return this.stats?.byReason?.[0] ?? null;
  }

  private toIsoDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}
