import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, finalize, timeout, catchError } from 'rxjs/operators';

import {
  AiApiService,
  PlatformRiskSummary,
  AiInsight,
  HighRiskClient,
  AiStatus,
} from '../../../core/ai-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  StatCardComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-ai-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    DecimalPipe,
    PageHeaderComponent,
    StatCardComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="AI Intelligence Hub" subtitle="Predictive compliance risk scoring, AI-powered audit observations, and payroll anomaly detection">
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="reload()">Refresh</ui-button>
          <ui-button variant="primary" (clicked)="navigateTo('ai-config')">⚙ AI Config</ui-button>
        </div>
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" size="lg" class="py-16 block"></ui-loading-spinner>

      <div *ngIf="errorMsg && !loading" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p class="text-red-700 text-sm">{{ errorMsg }}</p>
        <button class="text-red-600 underline text-xs mt-1" (click)="reload()">Try again</button>
      </div>

      <div *ngIf="!loading && !errorMsg">
        <!-- AI Status Banner -->
        <div *ngIf="status" class="mb-6 rounded-lg p-4"
             [ngClass]="status.aiEnabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'">
          <div class="flex items-center gap-3">
            <span class="text-2xl">{{ status.aiEnabled ? '🤖' : '⚠️' }}</span>
            <div>
              <p class="font-semibold" [ngClass]="status.aiEnabled ? 'text-emerald-800' : 'text-amber-800'">
                {{ status.aiEnabled ? 'AI Engine Active' : 'AI Running in Rule-Based Mode' }}
              </p>
              <p class="text-sm" [ngClass]="status.aiEnabled ? 'text-emerald-600' : 'text-amber-600'">
                {{ status.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Stat Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <ui-stat-card
            label="Total Assessed"
            [value]="summary?.total_assessed || '0'"
            color="info">
          </ui-stat-card>
          <ui-stat-card
            label="Critical Risk"
            [value]="summary?.critical || '0'"
            color="error">
          </ui-stat-card>
          <ui-stat-card
            label="High Risk"
            [value]="summary?.high || '0'"
            color="warning">
          </ui-stat-card>
          <ui-stat-card
            label="Avg Risk Score"
            [value]="(summary?.avg_score | number:'1.0-0') || '0'"
            color="primary">
          </ui-stat-card>
        </div>

        <!-- Exposure Summary -->
        <div *ngIf="summary" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Platform Penalty Exposure</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p class="text-sm text-gray-500">Minimum Exposure</p>
              <p class="text-2xl font-bold text-red-600">₹{{ summary.total_exposure_min | number:'1.0-0' }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Maximum Exposure</p>
              <p class="text-2xl font-bold text-red-700">₹{{ summary.total_exposure_max | number:'1.0-0' }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Risk Distribution</p>
              <div class="flex gap-2 mt-2">
                <span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                  {{ summary.critical }} Critical
                </span>
                <span class="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                  {{ summary.high }} High
                </span>
                <span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                  {{ summary.medium }} Medium
                </span>
                <span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                  {{ summary.low }} Low
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button (click)="navigateTo('ai-risk')"
                  class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-blue-400 hover:shadow-md transition-all text-left group">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-2xl group-hover:bg-blue-200 transition-colors">🛡</div>
              <div>
                <h3 class="font-semibold text-gray-900">Risk Assessments</h3>
                <p class="text-sm text-gray-500">Run & view client risk scores</p>
              </div>
            </div>
          </button>
          <button (click)="navigateTo('ai-audit')"
                  class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-purple-400 hover:shadow-md transition-all text-left group">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center text-2xl group-hover:bg-purple-200 transition-colors">📝</div>
              <div>
                <h3 class="font-semibold text-gray-900">Audit Observations</h3>
                <p class="text-sm text-gray-500">AI-generated DTSS observations</p>
              </div>
            </div>
          </button>
          <button (click)="navigateTo('ai-payroll')"
                  class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-orange-400 hover:shadow-md transition-all text-left group">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center text-2xl group-hover:bg-orange-200 transition-colors">💰</div>
              <div>
                <h3 class="font-semibold text-gray-900">Payroll Anomalies</h3>
                <p class="text-sm text-gray-500">Detect payroll irregularities</p>
              </div>
            </div>
          </button>
        </div>

        <!-- High Risk Clients Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-900">🚨 High Risk Clients</h2>
            <ui-button variant="ghost" size="sm" (clicked)="navigateTo('ai-risk')">View All →</ui-button>
          </div>
          <ui-data-table
            *ngIf="highRiskClients.length > 0"
            [columns]="riskColumns"
            [data]="highRiskClients"
            [pageSize]="10">
            <ng-template uiTableCell="risk_score" let-row>
              <span class="font-bold text-lg" [ngClass]="{
                'text-red-600': row.risk_score >= 80,
                'text-orange-600': row.risk_score >= 60 && row.risk_score < 80,
                'text-yellow-600': row.risk_score >= 40 && row.risk_score < 60,
                'text-green-600': row.risk_score < 40
              }">{{ row.risk_score }}</span>
            </ng-template>
            <ng-template uiTableCell="risk_level" let-row>
              <ui-status-badge [status]="row.risk_level"></ui-status-badge>
            </ng-template>
            <ng-template uiTableCell="penalty_exposure_max" let-row>
              <span class="text-red-600 font-medium">₹{{ row.penalty_exposure_max | number:'1.0-0' }}</span>
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <ui-button variant="ghost" size="sm" (clicked)="navigateTo('ai-risk', row.client_id)">Details →</ui-button>
            </ng-template>
          </ui-data-table>
          <ui-empty-state
            *ngIf="highRiskClients.length === 0"
            title="No Risk Assessments Yet"
            message="Run risk assessments from the Risk Assessments page to see high-risk clients here.">
          </ui-empty-state>
        </div>

        <!-- Active Insights -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">💡 Active Insights</h2>
          <div *ngIf="insights.length === 0">
            <ui-empty-state title="No Insights" message="AI insights will appear here after running risk assessments."></ui-empty-state>
          </div>
          <div *ngIf="insights.length > 0" class="space-y-3">
            <div *ngFor="let insight of insights; trackBy: trackInsight"
                 class="border rounded-lg p-4 flex items-start gap-4"
                 [ngClass]="{
                   'border-red-200 bg-red-50': insight.severity === 'CRITICAL',
                   'border-orange-200 bg-orange-50': insight.severity === 'HIGH',
                   'border-yellow-200 bg-yellow-50': insight.severity === 'MEDIUM',
                   'border-blue-200 bg-blue-50': insight.severity === 'LOW'
                 }">
              <div class="text-2xl">
                {{ insight.severity === 'CRITICAL' ? '🔴' : insight.severity === 'HIGH' ? '🟠' : insight.severity === 'MEDIUM' ? '🟡' : '🔵' }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold text-gray-900 text-sm">{{ insight.title }}</span>
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                        [ngClass]="{
                          'bg-red-100 text-red-700': insight.severity === 'CRITICAL',
                          'bg-orange-100 text-orange-700': insight.severity === 'HIGH',
                          'bg-yellow-100 text-yellow-700': insight.severity === 'MEDIUM',
                          'bg-blue-100 text-blue-700': insight.severity === 'LOW'
                        }">{{ insight.severity }}</span>
                </div>
                <p class="text-sm text-gray-600">{{ insight.description }}</p>
              </div>
              <button (click)="dismiss(insight)" class="text-gray-400 hover:text-gray-600 text-sm shrink-0">Dismiss</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AiDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  errorMsg = '';
  status: AiStatus | null = null;
  summary: PlatformRiskSummary | null = null;
  highRiskClients: HighRiskClient[] = [];
  insights: AiInsight[] = [];

  riskColumns: TableColumn[] = [
    { key: 'client_name', header: 'Client', sortable: true },
    { key: 'client_code', header: 'Code', sortable: true, width: '100px' },
    { key: 'risk_score', header: 'Score', sortable: true, width: '90px', align: 'center' },
    { key: 'risk_level', header: 'Level', sortable: true, width: '110px', align: 'center' },
    { key: 'penalty_exposure_max', header: 'Max Exposure', sortable: true, width: '140px', align: 'right' },
    { key: 'actions', header: '', sortable: false, width: '100px', align: 'right' },
  ];

  constructor(
    private ai: AiApiService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private toast: ToastService,
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
    this.errorMsg = '';
    this.cdr.markForCheck();

    forkJoin({
      status: this.ai.getStatus().pipe(timeout(8000), catchError(() => of(null))),
      dashboard: this.ai.getAiDashboard().pipe(timeout(8000), catchError(() => of(null))),
      highRisk: this.ai.getHighRiskClients(20).pipe(timeout(8000), catchError(() => of(null))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.status = res.status ?? null;
          this.summary = res.dashboard?.riskSummary ?? null;
          this.insights = res.dashboard?.recentInsights ?? [];
          this.highRiskClients = res.highRisk ?? [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMsg = 'Failed to load AI dashboard data.';
          this.cdr.markForCheck();
        },
      });
  }

  dismiss(insight: AiInsight): void {
    this.ai.dismissInsight(insight.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.insights = this.insights.filter((i) => i.id !== insight.id);
          this.toast.success('Insight dismissed.');
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to dismiss insight.'),
      });
  }

  navigateTo(page: string, clientId?: string): void {
    const base = '/admin/' + page;
    if (clientId) {
      this.router.navigate([base], { queryParams: { clientId } });
    } else {
      this.router.navigate([base]);
    }
  }

  trackInsight(_: number, item: AiInsight): string {
    return item.id;
  }
}
