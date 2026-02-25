import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';

import {
  AiApiService,
  RiskAssessment,
  HighRiskClient,
  AiInsight,
} from '../../../core/ai-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-ai-risk',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DecimalPipe,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="Risk Assessments" subtitle="AI-powered compliance risk scoring for all clients">
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="loadHighRisk()">Refresh</ui-button>
          <ui-button variant="primary" [disabled]="assessing" (clicked)="openAssessPanel()">
            {{ assessing ? 'Assessing...' : '+ Run Assessment' }}
          </ui-button>
        </div>
      </ui-page-header>

      <!-- Run Assessment Panel -->
      <div *ngIf="showAssessPanel" class="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
        <h3 class="font-semibold text-blue-900 mb-3">Run Risk Assessment</h3>
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
            <input type="text" [(ngModel)]="assessClientId" placeholder="Enter client UUID"
                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <ui-button variant="primary" [disabled]="!assessClientId || assessing" (clicked)="runAssessment()">
            {{ assessing ? 'Analysing...' : 'Run Assessment' }}
          </ui-button>
          <ui-button variant="ghost" (clicked)="showAssessPanel = false">Cancel</ui-button>
        </div>
      </div>

      <!-- Latest Assessment Result -->
      <div *ngIf="latestAssessment" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900">Latest Assessment Result</h2>
          <button (click)="latestAssessment = null" class="text-gray-400 hover:text-gray-600 text-sm">✕ Close</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div class="text-center">
            <p class="text-sm text-gray-500 mb-1">Risk Score</p>
            <p class="text-5xl font-bold" [ngClass]="{
              'text-red-600': latestAssessment.riskScore >= 80,
              'text-orange-600': latestAssessment.riskScore >= 60 && latestAssessment.riskScore < 80,
              'text-yellow-600': latestAssessment.riskScore >= 40 && latestAssessment.riskScore < 60,
              'text-green-600': latestAssessment.riskScore < 40
            }">{{ latestAssessment.riskScore }}</p>
            <ui-status-badge [status]="latestAssessment.riskLevel"></ui-status-badge>
          </div>
          <div>
            <p class="text-sm text-gray-500 mb-1">Inspection Probability</p>
            <p class="text-2xl font-bold text-gray-900">{{ (latestAssessment.inspectionProbability || 0) | number:'1.0-0' }}%</p>
          </div>
          <div>
            <p class="text-sm text-gray-500 mb-1">Penalty Range</p>
            <p class="text-lg font-bold text-red-600">
              ₹{{ (latestAssessment.penaltyExposureMin || 0) | number:'1.0-0' }} –
              ₹{{ (latestAssessment.penaltyExposureMax || 0) | number:'1.0-0' }}
            </p>
          </div>
          <div>
            <p class="text-sm text-gray-500 mb-1">Model</p>
            <p class="text-sm font-medium text-gray-700">{{ latestAssessment.aiModel || 'Rule-based' }}</p>
          </div>
        </div>

        <div class="mb-6">
          <h3 class="font-semibold text-gray-800 mb-2">Summary</h3>
          <p class="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">{{ latestAssessment.summary }}</p>
        </div>

        <!-- Risk Factors -->
        <div *ngIf="latestAssessment.riskFactors.length" class="mb-6">
          <h3 class="font-semibold text-gray-800 mb-3">Risk Factors</h3>
          <div class="space-y-2">
            <div *ngFor="let f of latestAssessment.riskFactors"
                 class="flex items-center gap-4 bg-gray-50 rounded-lg p-3">
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-900">{{ f.factor }}</p>
                <p class="text-xs text-gray-500">{{ f.detail }}</p>
              </div>
              <div class="text-right">
                <span class="text-sm font-mono text-gray-600">{{ f.value }}</span>
                <div class="w-20 h-2 bg-gray-200 rounded-full mt-1">
                  <div class="h-2 rounded-full" [ngClass]="{
                    'bg-red-500': f.weight >= 15,
                    'bg-orange-500': f.weight >= 10 && f.weight < 15,
                    'bg-yellow-500': f.weight >= 5 && f.weight < 10,
                    'bg-green-500': f.weight < 5
                  }" [style.width.%]="(f.weight / 20) * 100"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recommendations -->
        <div *ngIf="latestAssessment.recommendations.length">
          <h3 class="font-semibold text-gray-800 mb-3">Recommendations</h3>
          <div class="space-y-2">
            <div *ngFor="let r of latestAssessment.recommendations; let i = index"
                 class="flex items-start gap-3 bg-blue-50 rounded-lg p-3">
              <span class="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                {{ r.priority }}
              </span>
              <div>
                <p class="text-sm font-medium text-gray-900">{{ r.action }}</p>
                <p class="text-xs text-gray-500">Impact: {{ r.impact }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ui-loading-spinner *ngIf="loading" size="lg" class="py-16 block"></ui-loading-spinner>

      <!-- High Risk Clients Table -->
      <div *ngIf="!loading" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">All Assessed Clients (by Risk)</h2>
        <ui-data-table
          *ngIf="highRiskClients.length > 0"
          [columns]="columns"
          [data]="highRiskClients"
          [pageSize]="20">
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
          <ng-template uiTableCell="inspection_probability" let-row>
            <span class="font-medium">{{ (row.inspection_probability || 0) | number:'1.0-0' }}%</span>
          </ng-template>
          <ng-template uiTableCell="actions" let-row>
            <div class="flex gap-1 justify-end">
              <ui-button variant="ghost" size="sm" (clicked)="assessClient(row.client_id)">Re-assess</ui-button>
            </div>
          </ng-template>
        </ui-data-table>
        <ui-empty-state
          *ngIf="highRiskClients.length === 0"
          title="No Assessments Yet"
          message="Click 'Run Assessment' to score a client's compliance risk.">
        </ui-empty-state>
      </div>
    </div>
  `,
})
export class AiRiskComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  assessing = false;
  showAssessPanel = false;
  assessClientId = '';
  errorMsg = '';

  highRiskClients: HighRiskClient[] = [];
  latestAssessment: RiskAssessment | null = null;

  columns: TableColumn[] = [
    { key: 'client_name', header: 'Client', sortable: true },
    { key: 'client_code', header: 'Code', sortable: true, width: '100px' },
    { key: 'risk_score', header: 'Score', sortable: true, width: '90px', align: 'center' },
    { key: 'risk_level', header: 'Level', sortable: true, width: '110px', align: 'center' },
    { key: 'inspection_probability', header: 'Insp. Prob.', sortable: true, width: '110px', align: 'center' },
    { key: 'penalty_exposure_max', header: 'Max Exposure', sortable: true, width: '140px', align: 'right' },
    { key: 'actions', header: '', sortable: false, width: '120px', align: 'right' },
  ];

  constructor(
    private ai: AiApiService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    // Check if clientId was passed via queryParam
    const qp = this.route.snapshot.queryParamMap.get('clientId');
    if (qp) {
      this.assessClientId = qp;
      this.showAssessPanel = true;
    }
    this.loadHighRisk();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadHighRisk(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.ai.getHighRiskClients(100)
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (clients) => {
          this.loading = false;
          this.highRiskClients = clients ?? [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.toast.error('Failed to load risk data.');
          this.cdr.markForCheck();
        },
      });
  }

  openAssessPanel(): void {
    this.showAssessPanel = true;
    this.cdr.markForCheck();
  }

  runAssessment(): void {
    if (!this.assessClientId) return;
    this.assessing = true;
    this.cdr.markForCheck();

    this.ai.runRiskAssessment(this.assessClientId)
      .pipe(
        takeUntil(this.destroy$),
        timeout(30000),
        finalize(() => {
          this.assessing = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (assessment) => {
          this.assessing = false;
          this.latestAssessment = assessment;
          this.showAssessPanel = false;
          this.toast.success(`Risk assessment complete — Score: ${assessment.riskScore} (${assessment.riskLevel})`);
          this.loadHighRisk(); // Refresh list
          this.cdr.markForCheck();
        },
        error: () => {
          this.assessing = false;
          this.toast.error('Risk assessment failed. Check that the client ID is valid.');
          this.cdr.markForCheck();
        },
      });
  }

  assessClient(clientId: string): void {
    this.assessClientId = clientId;
    this.runAssessment();
  }
}
