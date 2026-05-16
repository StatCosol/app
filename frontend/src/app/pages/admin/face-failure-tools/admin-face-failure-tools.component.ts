import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../shared/toast/toast.service';

interface DetectorRunSummary {
  threshold: number;
  windowHours: number;
  dedupeHours: number;
  clientId: string | null;
  branchId: string | null;
  candidates: number;
  emitted: number;
  skipped: number;
}

@Component({
  selector: 'app-admin-face-failure-tools',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 md:p-6 space-y-4 max-w-3xl">
      <header>
        <h1 class="text-xl font-semibold text-slate-800">Face-failure spike detector</h1>
        <p class="text-sm text-slate-500 mt-1">
          Manually trigger the face-scan failure detector. By default it runs once a
          day at 06:00 IST. Use this to re-run after backfilling logs or to test
          threshold/window tweaks. Optional overrides are applied for this run only;
          they do not change the daily cron.
        </p>
      </header>

      <section class="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="text-sm">
            <span class="block text-slate-600 mb-1">Threshold</span>
            <input type="number" min="1" [(ngModel)]="threshold" placeholder="env default"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
          </label>
          <label class="text-sm">
            <span class="block text-slate-600 mb-1">Window (hours)</span>
            <input type="number" min="1" max="720" [(ngModel)]="windowHours" placeholder="env default"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
          </label>
          <label class="text-sm">
            <span class="block text-slate-600 mb-1">Dedupe (hours)</span>
            <input type="number" min="0" max="720" [(ngModel)]="dedupeHours" placeholder="env default"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
          </label>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="text-sm">
            <span class="block text-slate-600 mb-1">Client ID (optional)</span>
            <input type="text" [(ngModel)]="clientId" placeholder="UUID — all clients if blank"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm font-mono" />
          </label>
          <label class="text-sm">
            <span class="block text-slate-600 mb-1">Branch ID (optional)</span>
            <input type="text" [(ngModel)]="branchId" placeholder="UUID — all branches if blank"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm font-mono" />
          </label>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button type="button"
                  (click)="run()"
                  [disabled]="running"
                  class="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded">
            <span *ngIf="running" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            {{ running ? 'Running…' : 'Run detector now' }}
          </button>
          <span *ngIf="lastRunAt" class="text-xs text-slate-500">
            Last run: {{ lastRunAt | date: 'medium' }}
          </span>
        </div>
      </section>

      <section *ngIf="lastSummary" class="border border-slate-200 rounded-lg p-4 bg-slate-50">
        <h2 class="text-sm font-semibold text-slate-700 mb-2">Last run summary</h2>
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div><dt class="text-slate-500">Threshold</dt><dd class="font-medium">{{ lastSummary.threshold }}</dd></div>
          <div><dt class="text-slate-500">Window</dt><dd class="font-medium">{{ lastSummary.windowHours }}h</dd></div>
          <div><dt class="text-slate-500">Dedupe</dt><dd class="font-medium">{{ lastSummary.dedupeHours }}h</dd></div>
          <div><dt class="text-slate-500">Candidates</dt><dd class="font-medium">{{ lastSummary.candidates }}</dd></div>
          <div><dt class="text-slate-500">Emitted</dt><dd class="font-medium text-rose-700">{{ lastSummary.emitted }}</dd></div>
          <div><dt class="text-slate-500">Skipped (dedupe)</dt><dd class="font-medium text-slate-700">{{ lastSummary.skipped }}</dd></div>
          <div *ngIf="lastSummary.clientId"><dt class="text-slate-500">Client</dt><dd class="font-mono text-xs break-all">{{ lastSummary.clientId }}</dd></div>
          <div *ngIf="lastSummary.branchId"><dt class="text-slate-500">Branch</dt><dd class="font-mono text-xs break-all">{{ lastSummary.branchId }}</dd></div>
        </dl>
      </section>
    </div>
  `,
})
export class AdminFaceFailureToolsComponent {
  threshold: number | null = null;
  windowHours: number | null = null;
  dedupeHours: number | null = null;
  clientId = '';
  branchId = '';

  running = false;
  lastSummary: DetectorRunSummary | null = null;
  lastRunAt: Date | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  run(): void {
    if (this.running) return;
    this.running = true;
    const params: Record<string, string> = {};
    if (this.threshold != null && this.threshold > 0) {
      params['threshold'] = String(Math.floor(this.threshold));
    }
    if (this.windowHours != null && this.windowHours > 0) {
      params['windowHours'] = String(Math.floor(this.windowHours));
    }
    if (this.dedupeHours != null && this.dedupeHours >= 0) {
      params['dedupeHours'] = String(Math.floor(this.dedupeHours));
    }
    const cid = this.clientId.trim();
    if (cid) params['clientId'] = cid;
    const bid = this.branchId.trim();
    if (bid) params['branchId'] = bid;

    const url = `${environment.apiBaseUrl}/api/v1/client/mobile-attendance/failed-scans/run-detector`;
    this.http.post<DetectorRunSummary>(url, {}, { params }).subscribe({
      next: (res) => {
        this.lastSummary = res;
        this.lastRunAt = new Date();
        this.running = false;
        this.toast.success(
          'Detector run complete',
          `Candidates ${res.candidates} · Emitted ${res.emitted} · Skipped ${res.skipped}`,
        );
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.running = false;
        const msg =
          err?.error?.message ||
          err?.message ||
          'Failed to run face-failure detector';
        this.toast.error('Detector failed', String(msg));
        this.cdr.markForCheck();
      },
    });
  }
}
