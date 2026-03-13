import { Component, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';

import {
  AiApiService,
  PayrollAnomaly,
  AnomalySummary,
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
  selector: 'app-ai-payroll',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
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
      <ui-page-header title="Payroll Anomaly Detection" subtitle="AI-powered detection of wage violations, contribution mismatches, and statutory compliance issues">
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="refresh()">Refresh</ui-button>
          <ui-button variant="primary" (clicked)="showDetectPanel = true">+ Detect Anomalies</ui-button>
        </div>
      </ui-page-header>

      <!-- Detect Panel -->
      <div *ngIf="showDetectPanel" class="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
        <h3 class="font-semibold text-orange-900 mb-3">Run Anomaly Detection</h3>
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Client ID *</label>
            <input type="text" [(ngModel)]="detectClientId" placeholder="Client UUID"
                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Payroll Run ID (optional)</label>
            <input type="text" [(ngModel)]="detectRunId" placeholder="Optional run UUID"
                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
          </div>
          <ui-button variant="primary" [disabled]="!detectClientId || detecting" (clicked)="detect()">
            {{ detecting ? 'Scanning...' : '🔍 Detect' }}
          </ui-button>
          <ui-button variant="ghost" (clicked)="showDetectPanel = false">Cancel</ui-button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div *ngIf="anomalySummary" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <ui-stat-card
          label="Total Anomalies"
          [value]="anomalySummary.total"
          color="info">
        </ui-stat-card>
        <ui-stat-card
          label="Open Issues"
          [value]="anomalySummary.open"
          color="warning">
        </ui-stat-card>
        <ui-stat-card
          label="Critical Open"
          [value]="anomalySummary.critical_open"
          color="error">
        </ui-stat-card>
        <ui-stat-card
          label="Unique Types"
          [value]="anomalySummary.unique_types"
          color="primary">
        </ui-stat-card>
      </div>

      <ui-loading-spinner *ngIf="loading" size="lg" class="py-16 block"></ui-loading-spinner>

      <!-- Detection Results (just detected) -->
      <div *ngIf="detectedAnomalies.length > 0 && !loading" class="bg-white rounded-xl shadow-sm border border-orange-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">🔍 Latest Detection Results ({{ detectedAnomalies.length }} found)</h2>
        <div class="space-y-3">
          <div *ngFor="let a of detectedAnomalies; trackBy: trackAnomaly"
               class="border rounded-lg p-4"
               [ngClass]="{
                 'border-red-200 bg-red-50': a.severity === 'CRITICAL' || a.severity === 'HIGH',
                 'border-yellow-200 bg-yellow-50': a.severity === 'MEDIUM',
                 'border-gray-200': a.severity === 'LOW'
               }">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold text-gray-900 text-sm">{{ formatType(a.anomalyType) }}</span>
                  <ui-status-badge [status]="a.severity"></ui-status-badge>
                  <ui-status-badge [status]="a.status"></ui-status-badge>
                </div>
                <p class="text-sm text-gray-600">{{ a.description }}</p>
                <p *ngIf="a.recommendation" class="text-xs text-blue-600 mt-1">💡 {{ a.recommendation }}</p>
              </div>
              <div *ngIf="a.status === 'OPEN'" class="flex gap-2 shrink-0">
                <ui-button variant="primary" size="sm" (clicked)="resolve(a, 'RESOLVED')">Resolve</ui-button>
                <ui-button variant="ghost" size="sm" (clicked)="resolve(a, 'FALSE_POSITIVE')">False +</ui-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- All Anomalies Table -->
      <div *ngIf="!loading && anomalies.length > 0" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">All Anomalies</h2>
        <div class="flex gap-2 mb-4">
          <button *ngFor="let f of statusFilters"
                  (click)="activeFilter = f; filterAnomalies()"
                  class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  [ngClass]="activeFilter === f ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
            {{ f }}
          </button>
        </div>
        <ui-data-table
          [columns]="anomalyColumns"
          [data]="filteredAnomalies"
          [pageSize]="15">
          <ng-template uiTableCell="anomalyType" let-row>
            <span class="font-medium text-sm">{{ formatType(row.anomalyType) }}</span>
          </ng-template>
          <ng-template uiTableCell="severity" let-row>
            <ui-status-badge [status]="row.severity"></ui-status-badge>
          </ng-template>
          <ng-template uiTableCell="status" let-row>
            <ui-status-badge [status]="row.status"></ui-status-badge>
          </ng-template>
          <ng-template uiTableCell="detectedAt" let-row>
            <span class="text-xs text-gray-500">{{ row.detectedAt | date:'short' }}</span>
          </ng-template>
          <ng-template uiTableCell="actions" let-row>
            <div *ngIf="row.status === 'OPEN'" class="flex gap-1 justify-end">
              <ui-button variant="ghost" size="sm" (clicked)="resolve(row, 'RESOLVED')">Resolve</ui-button>
              <ui-button variant="ghost" size="sm" (clicked)="resolve(row, 'FALSE_POSITIVE')">FP</ui-button>
            </div>
            <span *ngIf="row.status !== 'OPEN'" class="text-xs text-gray-400">{{ row.status }}</span>
          </ng-template>
        </ui-data-table>
      </div>

      <div *ngIf="!loading && anomalies.length === 0 && detectedAnomalies.length === 0">
        <ui-empty-state
          title="No Anomalies"
          message="Click 'Detect Anomalies' to scan a client's payroll data for irregularities.">
        </ui-empty-state>
      </div>
    </div>
  `,
})
export class AiPayrollComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  detecting = false;
  showDetectPanel = false;
  detectClientId = '';
  detectRunId = '';

  anomalies: PayrollAnomaly[] = [];
  filteredAnomalies: PayrollAnomaly[] = [];
  detectedAnomalies: PayrollAnomaly[] = [];
  anomalySummary: AnomalySummary | null = null;

  statusFilters = ['ALL', 'OPEN', 'RESOLVED', 'FALSE_POSITIVE'];
  activeFilter = 'ALL';

  anomalyColumns: TableColumn[] = [
    { key: 'anomalyType', header: 'Type', sortable: true },
    { key: 'severity', header: 'Severity', sortable: true, width: '100px', align: 'center' },
    { key: 'description', header: 'Description', sortable: false },
    { key: 'status', header: 'Status', sortable: true, width: '120px', align: 'center' },
    { key: 'detectedAt', header: 'Detected', sortable: true, width: '130px' },
    { key: 'actions', header: '', sortable: false, width: '140px', align: 'right' },
  ];

  constructor(
    private ai: AiApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    if (!this.detectClientId) return;
    this.loadClientAnomalies(this.detectClientId);
  }

  detect(): void {
    if (!this.detectClientId) return;
    this.detecting = true;
    this.cdr.markForCheck();

    this.ai.detectPayrollAnomalies(this.detectClientId, this.detectRunId || undefined)
      .pipe(
        takeUntil(this.destroy$),
        timeout(20000),
        finalize(() => {
          this.detecting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (anomalies) => {
          this.detectedAnomalies = anomalies ?? [];
          this.showDetectPanel = false;
          if (anomalies.length > 0) {
            this.toast.success(`Found ${anomalies.length} anomalies!`);
          } else {
            this.toast.success('No anomalies detected — payroll looks clean!');
          }
          this.loadClientAnomalies(this.detectClientId);
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Anomaly detection failed.');
          this.cdr.markForCheck();
        },
      });
  }

  loadClientAnomalies(clientId: string): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.ai.listPayrollAnomalies(clientId)
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (anomalies) => {
          this.anomalies = anomalies ?? [];
          this.filterAnomalies();
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to load anomalies.'),
      });

    this.ai.getPayrollAnomalySummary(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.anomalySummary = s;
          this.cdr.markForCheck();
        },
      });
  }

  filterAnomalies(): void {
    if (this.activeFilter === 'ALL') {
      this.filteredAnomalies = [...this.anomalies];
    } else {
      this.filteredAnomalies = this.anomalies.filter((a) => a.status === this.activeFilter);
    }
    this.cdr.markForCheck();
  }

  resolve(anomaly: PayrollAnomaly, status: 'RESOLVED' | 'FALSE_POSITIVE'): void {
    this.ai.resolvePayrollAnomaly(anomaly.id, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          // Update in all arrays
          const update = (arr: PayrollAnomaly[]) => {
            const idx = arr.findIndex((a) => a.id === anomaly.id);
            if (idx >= 0) arr[idx] = updated;
          };
          update(this.anomalies);
          update(this.detectedAnomalies);
          this.filterAnomalies();
          this.toast.success(`Anomaly marked as ${status.toLowerCase().replace('_', ' ')}.`);
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to update anomaly.'),
      });
  }

  formatType(t: string): string {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  trackAnomaly(_: number, a: PayrollAnomaly): string {
    return a.id;
  }
}
