import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ClientMobileAttendanceService,
  ContractorForBranchRow,
  ContractorPunchRow,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

@Component({
  selector: 'app-branch-contractor-attendance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header
      title="Contractor Attendance"
      subtitle="View ConTrack face-attendance punches for contractor employees in your branch"
    ></ui-page-header>

    <div class="p-4 md:p-6 space-y-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="md:col-span-2">
          <label for="ctr" class="block text-xs font-medium text-gray-600 mb-1">Contractor</label>
          <select id="ctr" name="contractorUserId" [(ngModel)]="contractorUserId"
                  (change)="loadPunches()" class="ui-input">
            <option value="">— Select a contractor —</option>
            <option *ngFor="let c of contractors" [value]="c.contractorUserId">
              {{ c.contractorName || c.contractorEmail || '(unnamed)' }} · {{ c.employeeCount }} emp
            </option>
          </select>
          <p *ngIf="!loadingContractors && contractors.length === 0"
             class="mt-1 text-xs text-gray-500">
            No contractors with active employees in your branch.
          </p>
        </div>

        <div>
          <label for="from" class="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input id="from" name="from" type="date" [(ngModel)]="from"
                 (change)="loadPunches()" class="ui-input">
        </div>
        <div>
          <label for="to" class="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input id="to" name="to" type="date" [(ngModel)]="to"
                 (change)="loadPunches()" class="ui-input">
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 class="font-semibold text-gray-900">
            Punches
            <span *ngIf="punches.length" class="ml-2 text-xs font-normal text-gray-500">
              ({{ punches.length }})
            </span>
          </h3>
          <button type="button" class="text-sm text-indigo-600 hover:text-indigo-700"
                  [disabled]="loadingPunches" (click)="loadPunches()">
            Refresh
          </button>
        </div>

        <div *ngIf="loadingPunches" class="py-10 flex justify-center">
          <ui-loading-spinner></ui-loading-spinner>
        </div>

        <ng-container *ngIf="!loadingPunches">
          <div *ngIf="!contractorUserId">
            <ui-empty-state
              title="Select a contractor"
              description="Choose a contractor above to view its employees' face-attendance punches in your branch."
            ></ui-empty-state>
          </div>

          <div *ngIf="contractorUserId && !punches.length">
            <ui-empty-state
              title="No punches found"
              description="No ConTrack punches for this contractor in the selected window."
            ></ui-empty-state>
          </div>

          <div *ngIf="contractorUserId && punches.length" class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
                <tr>
                  <th class="px-4 py-2">Punch Time</th>
                  <th class="px-4 py-2">Employee</th>
                  <th class="px-4 py-2">Direction</th>
                  <th class="px-4 py-2">Source</th>
                  <th class="px-4 py-2">Match</th>
                  <th class="px-4 py-2">Liveness</th>
                  <th class="px-4 py-2">Photo</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let p of punches" class="hover:bg-gray-50">
                  <td class="px-4 py-2 whitespace-nowrap">{{ p.punchTime | date:'dd MMM yyyy, HH:mm' }}</td>
                  <td class="px-4 py-2">{{ p.contractorEmployeeName || '—' }}</td>
                  <td class="px-4 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          [class.bg-emerald-100]="p.direction === 'IN'"
                          [class.text-emerald-700]="p.direction === 'IN'"
                          [class.bg-amber-100]="p.direction === 'OUT'"
                          [class.text-amber-700]="p.direction === 'OUT'"
                          [class.bg-gray-100]="p.direction !== 'IN' && p.direction !== 'OUT'"
                          [class.text-gray-700]="p.direction !== 'IN' && p.direction !== 'OUT'">
                      {{ p.direction }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ p.source }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(p.matchScore) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(p.livenessScore) }}</td>
                  <td class="px-4 py-2">
                    <a *ngIf="p.photoUrl" [href]="p.photoUrl" target="_blank" rel="noopener"
                       class="text-indigo-600 hover:text-indigo-700 text-xs">View</a>
                    <span *ngIf="!p.photoUrl" class="text-xs text-gray-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class BranchContractorAttendanceComponent implements OnInit {
  contractors: ContractorForBranchRow[] = [];
  punches: ContractorPunchRow[] = [];
  contractorUserId = '';
  from = '';
  to = '';
  loadingContractors = false;
  loadingPunches = false;

  constructor(
    private svc: ClientMobileAttendanceService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    // Default window: last 7 days.
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    this.to = this.toIsoDate(today);
    this.from = this.toIsoDate(weekAgo);
    this.loadContractors();
  }

  loadContractors(): void {
    this.loadingContractors = true;
    this.svc
      .listContractorsForBranch()
      .pipe(finalize(() => (this.loadingContractors = false)))
      .subscribe({
        next: (rows) => {
          this.contractors = rows;
        },
        error: () => this.toast.error('Failed to load contractors'),
      });
  }

  loadPunches(): void {
    if (!this.contractorUserId) {
      this.punches = [];
      return;
    }
    this.loadingPunches = true;
    this.svc
      .listContractorPunches({
        contractorUserId: this.contractorUserId,
        from: this.from ? `${this.from}T00:00:00.000Z` : undefined,
        to: this.to ? `${this.to}T23:59:59.999Z` : undefined,
        limit: 500,
      })
      .pipe(finalize(() => (this.loadingPunches = false)))
      .subscribe({
        next: (rows) => {
          this.punches = rows;
        },
        error: () => this.toast.error('Failed to load punches'),
      });
  }

  fmtScore(v: string | null): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return `${(n * 100).toFixed(0)}%`;
  }

  private toIsoDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}
