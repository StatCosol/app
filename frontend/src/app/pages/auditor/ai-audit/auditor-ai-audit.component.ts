import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';

import { AiApiService, AuditObservation } from '../../../core/ai-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { FilterOptionsService } from '../../../shared/filters/services/filter-options.service';
import { ClientOption } from '../../../shared/filters/models/filter.model';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
  StatusBadgeComponent,
  ModalComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-auditor-ai-audit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
    ModalComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="AI Audit Insights"
                      subtitle="Generate DTSS-style audit observations, review process flows and resolve issues">
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="loadObservations()">Refresh</ui-button>
          <ui-button variant="primary" (clicked)="showGenerate = !showGenerate">
            {{ showGenerate ? 'Cancel' : '+ Generate Observation' }}
          </ui-button>
        </div>
      </ui-page-header>

      <!-- Generate Observation Form -->
      <div *ngIf="showGenerate" class="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6 shadow-sm">
        <h3 class="text-lg font-semibold text-amber-900 mb-4">Generate AI Observation</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select [(ngModel)]="genForm.clientId"
                    class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-sm">
              <option value="">Select client...</option>
              <option *ngFor="let c of clients" [value]="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Finding Type</label>
            <select [(ngModel)]="genForm.findingType"
                    class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-sm">
              <option value="">Select type...</option>
              <option value="NON_COMPLIANCE">Non-Compliance</option>
              <option value="PROCESS_GAP">Process Gap</option>
              <option value="DOCUMENTATION_ISSUE">Documentation Issue</option>
              <option value="SAFETY_VIOLATION">Safety Violation</option>
              <option value="WAGE_DISCREPANCY">Wage Discrepancy</option>
              <option value="REGISTRATION_LAPSE">Registration Lapse</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Applicable State</label>
            <input type="text" [(ngModel)]="genForm.applicableState" placeholder="e.g. Maharashtra, Karnataka"
                   class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Audit ID (optional)</label>
            <input type="text" [(ngModel)]="genForm.auditId" placeholder="Link to specific audit..."
                   class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-sm" />
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Finding Description *</label>
          <textarea [(ngModel)]="genForm.findingDescription" rows="3"
                    placeholder="Describe the finding, process flow issue, or non-compliance observed..."
                    class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-sm"></textarea>
        </div>
        <div class="flex justify-end">
          <ui-button variant="primary" [disabled]="generating || !genForm.clientId || !genForm.findingDescription"
                     (clicked)="generate()">
            {{ generating ? 'Generating...' : 'Generate Observation' }}
          </ui-button>
        </div>
      </div>

      <ui-loading-spinner *ngIf="loading" size="lg" class="py-16 block"></ui-loading-spinner>

      <!-- Observations List -->
      <div *ngIf="!loading" class="space-y-4">
        <div *ngIf="observations.length === 0">
          <ui-empty-state
            title="No Observations Yet"
            message="Use the Generate button to create AI-powered audit observations from your findings.">
          </ui-empty-state>
        </div>

        <div *ngFor="let obs of observations; trackBy: trackObs"
             class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="p-6">
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-semibold text-gray-900">{{ obs.observationTitle || 'Observation' }}</h3>
                  <ui-status-badge [status]="obs.status"></ui-status-badge>
                  <span class="px-2 py-0.5 text-xs font-medium rounded"
                        [ngClass]="{
                          'bg-red-100 text-red-700': obs.riskRating === 'CRITICAL' || obs.riskRating === 'HIGH',
                          'bg-yellow-100 text-yellow-700': obs.riskRating === 'MEDIUM',
                          'bg-green-100 text-green-700': obs.riskRating === 'LOW'
                        }">{{ obs.riskRating }}</span>
                </div>
                <p class="text-sm text-gray-500">
                  {{ obs.findingType }} · {{ obs.createdAt | date:'mediumDate' }}
                  <span *ngIf="obs.applicableState"> · {{ obs.applicableState }}</span>
                </p>
              </div>
              <div class="flex gap-2 shrink-0">
                <ui-button variant="ghost" size="sm" (clicked)="selectObs(obs)">View</ui-button>
              </div>
            </div>

            <!-- Finding Description -->
            <div class="bg-gray-50 rounded-lg p-3 mb-3">
              <p class="text-xs font-semibold text-gray-500 mb-1">FINDING</p>
              <p class="text-sm text-gray-700">{{ obs.findingDescription }}</p>
            </div>

            <!-- AI Generated Observation -->
            <div *ngIf="obs.observationText" class="bg-amber-50 rounded-lg p-3 mb-3">
              <p class="text-xs font-semibold text-amber-600 mb-1">AI OBSERVATION</p>
              <p class="text-sm text-gray-800 whitespace-pre-line">{{ obs.observationText }}</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div *ngIf="obs.sectionReference">
                <p class="text-xs text-gray-500 font-medium">Legal Reference</p>
                <p class="text-gray-800 font-medium">{{ obs.sectionReference }}</p>
              </div>
              <div *ngIf="obs.consequence">
                <p class="text-xs text-gray-500 font-medium">Consequence</p>
                <p class="text-gray-800">{{ obs.consequence }}</p>
              </div>
              <div *ngIf="obs.fineEstimationMin !== null && obs.fineEstimationMin !== undefined">
                <p class="text-xs text-gray-500 font-medium">Fine Estimate</p>
                <p class="text-red-600 font-medium">₹{{ obs.fineEstimationMin | number:'1.0-0' }} – ₹{{ obs.fineEstimationMax | number:'1.0-0' }}</p>
              </div>
              <div *ngIf="obs.correctiveAction">
                <p class="text-xs text-gray-500 font-medium">Corrective Action</p>
                <p class="text-gray-800">{{ obs.correctiveAction }}</p>
              </div>
            </div>

            <div *ngIf="obs.confidenceScore" class="mt-3 flex items-center gap-2">
              <span class="text-xs text-gray-500">AI Confidence:</span>
              <div class="w-24 h-2 bg-gray-200 rounded-full">
                <div class="h-2 rounded-full bg-amber-500" [style.width.%]="obs.confidenceScore * 100"></div>
              </div>
              <span class="text-xs text-gray-600">{{ (obs.confidenceScore * 100) | number:'1.0-0' }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Detail Modal -->
      <ui-modal *ngIf="selectedObs" [isOpen]="!!selectedObs" size="lg" (closed)="selectedObs = null">
        <div header>
          <h2 class="text-lg font-semibold">{{ selectedObs.observationTitle || 'Observation Details' }}</h2>
        </div>
        <div body>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div><span class="text-gray-500">Status:</span> <ui-status-badge [status]="selectedObs.status"></ui-status-badge></div>
              <div><span class="text-gray-500">Risk:</span> <span class="font-medium">{{ selectedObs.riskRating }}</span></div>
              <div><span class="text-gray-500">Type:</span> <span>{{ selectedObs.findingType }}</span></div>
              <div><span class="text-gray-500">State:</span> <span>{{ selectedObs.applicableState || 'N/A' }}</span></div>
              <div><span class="text-gray-500">Timeline:</span> <span>{{ selectedObs.timelineDays || 'N/A' }} days</span></div>
              <div><span class="text-gray-500">Model:</span> <span>{{ selectedObs.aiModel || 'Rule-based' }}</span></div>
            </div>
            <div *ngIf="selectedObs.findingDescription">
              <h4 class="font-semibold text-sm mb-1">Finding Description</h4>
              <p class="text-sm text-gray-700 bg-gray-50 rounded p-3">{{ selectedObs.findingDescription }}</p>
            </div>
            <div *ngIf="selectedObs.observationText">
              <h4 class="font-semibold text-sm mb-1">AI Observation</h4>
              <p class="text-sm text-gray-700 bg-amber-50 rounded p-3 whitespace-pre-line">{{ selectedObs.observationText }}</p>
            </div>
            <div *ngIf="selectedObs.correctiveAction">
              <h4 class="font-semibold text-sm mb-1">Corrective Action</h4>
              <p class="text-sm text-gray-700 bg-green-50 rounded p-3">{{ selectedObs.correctiveAction }}</p>
            </div>
            <div *ngIf="selectedObs.stateSpecificRules">
              <h4 class="font-semibold text-sm mb-1">State-Specific Rules</h4>
              <p class="text-sm text-gray-700 bg-yellow-50 rounded p-3">{{ selectedObs.stateSpecificRules }}</p>
            </div>
            <div *ngIf="selectedObs.auditorNotes">
              <h4 class="font-semibold text-sm mb-1">Review Notes</h4>
              <p class="text-sm text-gray-700 bg-blue-50 rounded p-3">{{ selectedObs.auditorNotes }}</p>
            </div>
          </div>
        </div>
      </ui-modal>
    </div>
  `,
})
export class AuditorAiAuditComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  generating = false;
  showGenerate = false;
  observations: AuditObservation[] = [];
  selectedObs: AuditObservation | null = null;
  clients: ClientOption[] = [];

  genForm = {
    clientId: '',
    auditId: '',
    findingType: '',
    findingDescription: '',
    applicableState: '',
  };

  constructor(
    private ai: AiApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private filterOptions: FilterOptionsService,
  ) {}

  ngOnInit(): void {
    this.loadObservations();
    this.filterOptions.auditorClients()
      .pipe(takeUntil(this.destroy$), timeout(8000))
      .subscribe({
        next: (rows) => { this.clients = rows ?? []; this.cdr.markForCheck(); },
        error: () => { this.toast.error('Failed to load clients list.'); },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadObservations(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.ai.listAuditObservations()
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (obs) => {
          this.observations = obs ?? [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Failed to load observations.');
          this.cdr.markForCheck();
        },
      });
  }

  generate(): void {
    if (!this.genForm.clientId || !this.genForm.findingDescription) return;
    this.generating = true;
    this.cdr.markForCheck();

    const params: any = {
      clientId: this.genForm.clientId,
      findingDescription: this.genForm.findingDescription,
    };
    if (this.genForm.auditId) params.auditId = this.genForm.auditId;
    if (this.genForm.findingType) params.findingType = this.genForm.findingType;
    if (this.genForm.applicableState) params.applicableState = this.genForm.applicableState;

    this.ai.generateAuditObservation(params)
      .pipe(
        takeUntil(this.destroy$),
        timeout(30000),
        finalize(() => {
          this.generating = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (obs) => {
          this.observations.unshift(obs);
          this.showGenerate = false;
          this.genForm = { clientId: '', auditId: '', findingType: '', findingDescription: '', applicableState: '' };
          this.toast.success('Observation generated successfully!');
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Failed to generate observation.');
          this.cdr.markForCheck();
        },
      });
  }

  selectObs(obs: AuditObservation): void {
    this.selectedObs = obs;
    this.cdr.markForCheck();
  }

  trackObs(_: number, obs: AuditObservation): string {
    return obs.id;
  }
}
