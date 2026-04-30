import { Component, Input, OnChanges, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AiRiskApi, AiRiskBranchResponse } from '../../../core/api/ai-risk.api';

@Component({
  selector: 'app-ai-risk-score',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-2xl border border-gray-200 bg-white p-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-lg font-semibold text-gray-900">AI Risk Score</div>
          <div class="text-xs text-gray-500" *ngIf="data">{{ data.period }}</div>
        </div>
        <button class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          (click)="load()" [disabled]="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div *ngIf="loading" class="text-sm text-gray-400 py-4 text-center">Calculating risk score…</div>
      <div *ngIf="!loading && errorMsg" class="text-sm text-red-600 py-4 text-center">{{ errorMsg }}</div>

      <ng-container *ngIf="!loading && !errorMsg && data">
        <!-- Score + Badge + Bar -->
        <div class="flex items-center gap-4 mb-4">
          <div class="text-4xl font-bold" [ngClass]="scoreColor">{{ data.riskScore }}</div>
          <span class="text-xs font-medium px-2 py-1 rounded-full" [ngClass]="badgeClass">{{ data.riskLevel }}</span>
          <div class="flex-1 ml-2">
            <div class="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700" [ngClass]="barColor"
                [style.width.%]="data.riskScore"></div>
            </div>
          </div>
        </div>
        <div class="text-xs text-gray-500 mb-4">
          Inspection probability: <span class="font-medium text-gray-700">{{ data.inspectionProbability }}</span>
        </div>

        <!-- Inputs Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <ng-container *ngFor="let card of inputCards">
            <div class="rounded-xl border border-gray-200 p-3">
              <div class="text-xs text-gray-500">{{ card.label }}</div>
              <div class="text-lg font-semibold text-gray-900">{{ card.value }}</div>
            </div>
          </ng-container>
        </div>

        <!-- Key Findings -->
        <div *ngIf="data.keyFindings.length" class="mb-4">
          <div class="text-sm font-medium text-gray-700 mb-1">Key Findings</div>
          <ul class="space-y-1">
            <li *ngFor="let f of data.keyFindings" class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-0.5 text-amber-500">&#9679;</span>{{ f }}
            </li>
          </ul>
        </div>

        <!-- Recommended Actions -->
        <div *ngIf="data.recommendedActions.length">
          <div class="text-sm font-medium text-gray-700 mb-1">Recommended Actions</div>
          <ul class="space-y-1">
            <li *ngFor="let a of data.recommendedActions" class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-0.5 text-green-500">&#10003;</span>{{ a }}
            </li>
          </ul>
        </div>
      </ng-container>
    </div>
  `,
})
export class AiRiskScoreComponent implements OnChanges, OnDestroy {
  @Input() branchId = '';
  @Input() year = 0;
  @Input() month = 0;

  loading = false;
  errorMsg = '';
  data: AiRiskBranchResponse | null = null;
  inputCards: { label: string; value: string | number }[] = [];

  /* derived style bindings */
  scoreColor = 'text-gray-900';
  badgeClass = 'bg-gray-100 text-gray-600';
  barColor = 'bg-gray-400';

  private loadSub?: Subscription;

  constructor(
    private api: AiRiskApi,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    if (!this.branchId || !this.year || !this.month) return;
    this.load();
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMsg = '';
    this.data = null;
    this.inputCards = [];

    this.loadSub?.unsubscribe();
    this.loadSub = this.api.getBranchRisk(this.branchId, this.year, this.month).subscribe({
      next: (res) => {
        this.data = res;
        this.computeStyles(res.riskLevel);
        this.buildCards(res.inputs);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMsg = 'Failed to load risk score';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private computeStyles(level: string): void {
    switch (level?.toUpperCase()) {
      case 'CRITICAL':
        this.scoreColor = 'text-rose-700';
        this.badgeClass = 'bg-rose-100 text-rose-800';
        this.barColor = 'bg-rose-600';
        break;
      case 'HIGH':
        this.scoreColor = 'text-red-600';
        this.badgeClass = 'bg-red-100 text-red-700';
        this.barColor = 'bg-red-500';
        break;
      case 'MEDIUM':
        this.scoreColor = 'text-amber-600';
        this.badgeClass = 'bg-amber-100 text-amber-700';
        this.barColor = 'bg-amber-500';
        break;
      case 'LOW':
        this.scoreColor = 'text-green-600';
        this.badgeClass = 'bg-green-100 text-green-700';
        this.barColor = 'bg-green-500';
        break;
      default:
        this.scoreColor = 'text-gray-900';
        this.badgeClass = 'bg-gray-100 text-gray-600';
        this.barColor = 'bg-gray-400';
    }
  }

  private buildCards(inputs: AiRiskBranchResponse['inputs']): void {
    if (!inputs) return;
    this.inputCards = [
      { label: 'MCD Uploaded', value: inputs.mcdUploaded ? 'Yes' : 'No' },
      { label: 'MCD %', value: inputs.mcdPercent != null ? inputs.mcdPercent + '%' : '—' },
      { label: 'Returns Pending', value: inputs.returnsPending ?? '—' },
      { label: 'PF Not Registered', value: inputs.pfNotRegisteredEmployees ?? '—' },
      { label: 'ESI Applicable Not Reg.', value: inputs.esiApplicableButNotRegistered ?? '—' },
      { label: 'Days Pending Avg', value: inputs.daysPendingAverage ?? '—' },
      { label: 'Contractor Upload %', value: inputs.contractorUploadPercentage != null ? inputs.contractorUploadPercentage + '%' : '—' },
      { label: 'Audit Critical NCs', value: inputs.auditCriticalNC ?? '—' },
      { label: 'Audit High NCs', value: inputs.auditHighNC ?? '—' },
      { label: 'Audit Medium NCs', value: inputs.auditMediumNC ?? '—' },
    ];
  }
}
