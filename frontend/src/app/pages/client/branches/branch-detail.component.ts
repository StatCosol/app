import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { StatusBadgeComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { BranchAuditKpiComponent } from '../../../shared/ui/branch-audit-kpi/branch-audit-kpi.component';
import { AiRiskScoreComponent } from '../../../shared/ui/ai-risk-score/ai-risk-score.component';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AuthService } from '../../../core/auth.service';

type Tab = 'overview' | 'documents' | 'mcd' | 'contractors' | 'dashboard';

@Component({
  selector: 'app-branch-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, StatusBadgeComponent, LoadingSpinnerComponent, BranchAuditKpiComponent, AiRiskScoreComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <!-- Back link -->
      <button (click)="goBack()" class="flex items-center gap-1 text-sm text-gray-500 hover:text-statco-blue mb-4 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        Back to Branches
      </button>

      <!-- Loading -->
      <div *ngIf="loading" class="flex items-center justify-center py-20">
        <ui-loading-spinner></ui-loading-spinner>
      </div>

      <ng-container *ngIf="!loading && branch">
        <!-- Header -->
        <div class="flex items-start justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ branch.branchName }}</h1>
            <div class="flex items-center gap-3 mt-1">
              <span *ngIf="branch.establishmentType" class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
                [ngClass]="{
                  'bg-purple-100 text-purple-700': branch.establishmentType === 'HO',
                  'bg-blue-100 text-blue-700': branch.establishmentType === 'BRANCH',
                  'bg-amber-100 text-amber-700': branch.establishmentType === 'FACTORY',
                  'bg-green-100 text-green-700': branch.establishmentType === 'WAREHOUSE',
                  'bg-teal-100 text-teal-700': branch.establishmentType === 'SHOP'
                }">
                {{ branch.establishmentType }}
              </span>
              <span *ngIf="branch.stateCode" class="text-sm text-gray-500">{{ branch.stateCode }}</span>
              <ui-status-badge [status]="branch.status || 'ACTIVE'"></ui-status-badge>
            </div>
          </div>
        </div>

        <!-- Stat Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Contractors</div>
            <div class="text-2xl font-bold text-blue-600">{{ branch.contractorCount ?? 0 }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Compliances</div>
            <div class="text-2xl font-bold text-indigo-600">{{ branch.complianceCount ?? 0 }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Documents</div>
            <div class="text-2xl font-bold text-gray-900">{{ branch.documentStats?.total ?? 0 }}</div>
            <div class="text-[10px] text-gray-400 mt-0.5">{{ branch.documentStats?.approved ?? 0 }} approved</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Pending Review</div>
            <div class="text-2xl font-bold" [ngClass]="(branch.documentStats?.uploaded ?? 0) > 0 ? 'text-amber-600' : 'text-gray-400'">
              {{ branch.documentStats?.uploaded ?? 0 }}
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-6">
          <nav class="flex gap-6">
            <button *ngFor="let t of tabs" (click)="activeTab = t.key; onTabChange()"
              class="pb-3 text-sm font-medium border-b-2 transition-colors"
              [ngClass]="activeTab === t.key ? 'border-statco-blue text-statco-blue' : 'border-transparent text-gray-500 hover:text-gray-700'">
              {{ t.label }}
            </button>
          </nav>
        </div>

        <!-- Overview Tab -->
        <div *ngIf="activeTab === 'overview'" class="bg-white rounded-2xl border border-gray-200 p-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Branch Name</div><div class="text-sm text-gray-900 font-medium">{{ branch.branchName }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Branch Type</div><div class="text-sm text-gray-900">{{ branch.branchType || '—' }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Establishment Type</div><div class="text-sm text-gray-900">{{ branch.establishmentType || '—' }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">State</div><div class="text-sm text-gray-900">{{ branch.stateCode || '—' }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">City</div><div class="text-sm text-gray-900">{{ branch.city || '—' }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Pincode</div><div class="text-sm text-gray-900">{{ branch.pincode || '—' }}</div></div>
            <div class="sm:col-span-2"><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Address</div><div class="text-sm text-gray-900">{{ branch.address || '—' }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Headcount</div><div class="text-sm text-gray-900">{{ branch.headcount ?? 0 }}</div></div>
            <div><div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Employees</div><div class="text-sm text-gray-900">{{ branch.employeeCount ?? 0 }}</div></div>
          </div>

          <div class="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-3">
            <button (click)="goToCompliance()" class="px-4 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors">
              View Compliance Tasks
            </button>
            <button (click)="goToContractors()" class="px-4 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
              View Contractors
            </button>
          </div>
        </div>

        <!-- Documents Tab -->
        <div *ngIf="activeTab === 'documents'">
          <!-- Upload Section (branch users only) -->
          <div *ngIf="!isMasterUser" class="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">Upload Document</h3>
            <div class="flex flex-wrap items-end gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Category</label>
                <select [(ngModel)]="uploadCategory" class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="REGISTRATION">Registration</option>
                  <option value="COMPLIANCE_MONTHLY">Compliance Monthly</option>
                  <option value="AUDIT_EVIDENCE">Audit Evidence</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Document Type</label>
                <input type="text" [(ngModel)]="uploadDocType" placeholder="e.g. Shop License" class="px-3 py-2 border border-gray-200 rounded-lg text-sm w-48" />
              </div>
              <div *ngIf="uploadCategory === 'COMPLIANCE_MONTHLY'">
                <label class="block text-xs text-gray-500 mb-1">Period</label>
                <div class="flex gap-2">
                  <input type="number" [(ngModel)]="uploadYear" placeholder="Year" class="px-2 py-2 border border-gray-200 rounded-lg text-sm w-20" />
                  <input type="number" [(ngModel)]="uploadMonth" placeholder="Mo" class="px-2 py-2 border border-gray-200 rounded-lg text-sm w-16" min="1" max="12" />
                </div>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">File</label>
                <input type="file" (change)="onFileSelect($event)" class="text-sm" />
              </div>
              <button (click)="uploadDocument()" [disabled]="uploading"
                class="px-4 py-2 text-sm bg-statco-blue text-white rounded-lg hover:bg-statco-blue/90 disabled:opacity-50 transition-colors">
                {{ uploading ? 'Uploading…' : 'Upload' }}
              </button>
            </div>
            <div *ngIf="uploadError" class="mt-2 text-sm text-red-600">{{ uploadError }}</div>
            <div *ngIf="uploadSuccess" class="mt-2 text-sm text-green-600">Document uploaded successfully!</div>
          </div>
          <div *ngIf="isMasterUser" class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-sm text-amber-800">
            Only branch users can upload documents. Master users have read-only access.
          </div>

          <!-- Document Filters -->
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <select [(ngModel)]="docCategoryFilter" (change)="loadDocuments()" class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">All Categories</option>
              <option value="REGISTRATION">Registration</option>
              <option value="COMPLIANCE_MONTHLY">Compliance Monthly</option>
              <option value="AUDIT_EVIDENCE">Audit Evidence</option>
            </select>
            <select [(ngModel)]="docStatusFilter" (change)="loadDocuments()" class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">All Statuses</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <!-- Documents List -->
          <div *ngIf="docsLoading" class="flex items-center justify-center py-10"><ui-loading-spinner></ui-loading-spinner></div>
          <div *ngIf="!docsLoading && documents.length" class="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th class="px-4 py-3 text-left">Document</th>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-center">Period</th>
                  <th class="px-4 py-3 text-center">Status</th>
                  <th class="px-4 py-3 text-left">Remarks</th>
                  <th class="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let d of documents" class="border-t border-gray-100">
                  <td class="px-4 py-3 font-medium text-gray-900">{{ d.docType }}<br/><span class="text-xs text-gray-400">{{ d.fileName }}</span></td>
                  <td class="px-4 py-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase"
                      [ngClass]="{
                        'bg-blue-50 text-blue-700': d.category === 'REGISTRATION',
                        'bg-green-50 text-green-700': d.category === 'COMPLIANCE_MONTHLY',
                        'bg-purple-50 text-purple-700': d.category === 'AUDIT_EVIDENCE'
                      }">
                      {{ d.category }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center text-gray-500">{{ d.periodMonth && d.periodYear ? d.periodMonth + '/' + d.periodYear : '—' }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                      [ngClass]="{
                        'bg-gray-100 text-gray-600': d.status === 'UPLOADED',
                        'bg-amber-100 text-amber-700': d.status === 'UNDER_REVIEW',
                        'bg-green-100 text-green-700': d.status === 'APPROVED',
                        'bg-red-100 text-red-700': d.status === 'REJECTED'
                      }">
                      {{ d.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ d.remarks || '—' }}</td>
                  <td class="px-4 py-3 text-center">
                    <button *ngIf="!isMasterUser && d.status === 'REJECTED'" (click)="reuploadTarget = d" class="text-xs text-blue-600 hover:underline">Re-upload</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div *ngIf="!docsLoading && !documents.length" class="text-center py-10 text-gray-400 text-sm">No documents uploaded yet</div>

          <!-- Reupload Modal -->
          <div *ngIf="reuploadTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h3 class="font-semibold text-gray-900 mb-3">Re-upload: {{ reuploadTarget.docType }}</h3>
              <input type="file" (change)="onReuploadFileSelect($event)" class="text-sm mb-4" />
              <div class="flex justify-end gap-3">
                <button (click)="reuploadTarget = null" class="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                <button (click)="doReupload()" [disabled]="reuploading"
                  class="px-4 py-2 text-sm bg-statco-blue text-white rounded-lg hover:bg-statco-blue/90 disabled:opacity-50">
                  {{ reuploading ? 'Uploading…' : 'Re-upload' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- MCD Tab -->
        <div *ngIf="activeTab === 'mcd'">
          <div *ngIf="mcdLoading" class="flex items-center justify-center py-10"><ui-loading-spinner></ui-loading-spinner></div>
          <div *ngIf="!mcdLoading" class="space-y-3">
            <div *ngFor="let m of mcdOverview"
              class="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <div class="font-medium text-gray-900">{{ monthName(m.periodMonth) }} {{ m.periodYear }}</div>
                <div class="text-xs text-gray-500 mt-0.5">Window: {{ m.uploadWindowStart | date:'MMM d' }} — {{ m.uploadWindowEnd | date:'MMM d, y' }}</div>
              </div>
              <div class="flex items-center gap-3">
                <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold uppercase"
                  [ngClass]="{
                    'bg-green-100 text-green-700': m.windowStatus === 'COMPLETED',
                    'bg-blue-100 text-blue-700': m.windowStatus === 'UPLOADED',
                    'bg-amber-100 text-amber-700': m.windowStatus === 'OPEN' || m.windowStatus === 'REUPLOAD_NEEDED',
                    'bg-red-100 text-red-700': m.windowStatus === 'OVERDUE',
                    'bg-gray-100 text-gray-500': m.windowStatus === 'UPCOMING'
                  }">
                  {{ m.windowStatus }}
                </span>
                <span class="text-xs text-gray-400">{{ m.documents?.length ?? 0 }} doc(s)</span>
              </div>
            </div>
          </div>
          <div *ngIf="!mcdLoading && !mcdOverview.length" class="text-center py-10 text-gray-400 text-sm">No MCD data available</div>
        </div>

        <!-- Contractors Tab -->
        <div *ngIf="activeTab === 'contractors'">
          <div class="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <p class="text-sm text-gray-500 mb-4">{{ branch.contractorCount ?? 0 }} contractor(s) assigned to this branch</p>
            <button (click)="goToContractors()" class="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Open Contractors for this Branch
            </button>
          </div>
        </div>

        <!-- Dashboard Tab -->
        <div *ngIf="activeTab === 'dashboard'">
          <!-- Month Selector -->
          <div class="flex items-center gap-3 mb-5">
            <label class="text-sm text-gray-600">Month:</label>
            <input type="month" [(ngModel)]="dashboardMonth" (change)="loadDashboard()"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          </div>

          <div *ngIf="dashboardLoading" class="flex items-center justify-center py-12"><ui-loading-spinner></ui-loading-spinner></div>

          <ng-container *ngIf="!dashboardLoading && dashboard">
            <!-- KPI Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div class="bg-white rounded-xl border border-gray-200 p-4">
                <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Vendor Score</div>
                <div class="text-2xl font-bold" [ngClass]="dashboard.vendorScorePercent >= 70 ? 'text-green-600' : dashboard.vendorScorePercent >= 40 ? 'text-amber-600' : 'text-red-600'">
                  {{ dashboard.vendorScorePercent }}%
                </div>
              </div>
              <div class="bg-white rounded-xl border border-gray-200 p-4">
                <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Doc Upload %</div>
                <div class="text-2xl font-bold" [ngClass]="dashboard.documentsUploadPercent >= 80 ? 'text-green-600' : dashboard.documentsUploadPercent >= 50 ? 'text-amber-600' : 'text-red-600'">
                  {{ dashboard.documentsUploadPercent }}%
                </div>
              </div>
              <div class="bg-white rounded-xl border border-gray-200 p-4">
                <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Vendors</div>
                <div class="text-2xl font-bold text-blue-600">{{ dashboard.contractors?.total ?? 0 }}</div>
              </div>
              <div class="bg-white rounded-xl border border-gray-200 p-4">
                <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">MCD Docs</div>
                <div class="text-2xl font-bold text-gray-900">{{ dashboard.documentStats?.total ?? 0 }}</div>
                <div class="text-[10px] text-gray-400 mt-0.5">{{ dashboard.documentStats?.approved ?? 0 }} approved</div>
              </div>
            </div>

            <!-- Top 10 High Score Vendors -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5 mb-5">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">Top 10 High Score Vendors</h3>
              <div *ngIf="dashboard.contractors?.top10HighScoreVendors?.length" class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead><tr class="text-left text-xs text-gray-500 uppercase">
                    <th class="pb-2">Vendor</th><th class="pb-2 text-right">Score</th><th class="pb-2 text-right">Required</th><th class="pb-2 text-right">Uploaded</th><th class="pb-2 text-right">Missing</th>
                  </tr></thead>
                  <tbody>
                    <tr *ngFor="let v of dashboard.contractors.top10HighScoreVendors" class="border-t border-gray-100">
                      <td class="py-2 text-gray-900">{{ v.contractorName }}</td>
                      <td class="py-2 text-right font-semibold" [ngClass]="v.score >= 70 ? 'text-green-600' : v.score >= 40 ? 'text-amber-600' : 'text-red-600'">{{ v.score }}</td>
                      <td class="py-2 text-right text-gray-600">{{ v.requiredCount }}</td>
                      <td class="py-2 text-right text-gray-600">{{ v.uploadedCount }}</td>
                      <td class="py-2 text-right text-gray-600">{{ v.missingCount }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div *ngIf="!dashboard.contractors?.top10HighScoreVendors?.length" class="text-sm text-gray-400 py-3">No vendor data</div>
            </div>

            <!-- Top 10 Low Score Vendors -->
            <div class="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">Top 10 Low Score Vendors</h3>
              <div *ngIf="dashboard.contractors?.top10LowScoreVendors?.length" class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead><tr class="text-left text-xs text-gray-500 uppercase">
                    <th class="pb-2">Vendor</th><th class="pb-2 text-right">Score</th><th class="pb-2 text-right">Required</th><th class="pb-2 text-right">Uploaded</th><th class="pb-2 text-right">Missing</th>
                  </tr></thead>
                  <tbody>
                    <tr *ngFor="let v of dashboard.contractors.top10LowScoreVendors" class="border-t border-gray-100">
                      <td class="py-2 text-gray-900">{{ v.contractorName }}</td>
                      <td class="py-2 text-right font-semibold" [ngClass]="v.score >= 70 ? 'text-green-600' : v.score >= 40 ? 'text-amber-600' : 'text-red-600'">{{ v.score }}</td>
                      <td class="py-2 text-right text-gray-600">{{ v.requiredCount }}</td>
                      <td class="py-2 text-right text-gray-600">{{ v.uploadedCount }}</td>
                      <td class="py-2 text-right text-gray-600">{{ v.missingCount }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div *ngIf="!dashboard.contractors?.top10LowScoreVendors?.length" class="text-sm text-gray-400 py-3">No vendor data</div>
            </div>
          </ng-container>

          <div *ngIf="!dashboardLoading && !dashboard" class="text-center py-10 text-gray-400 text-sm">No dashboard data available</div>

          <!-- Audit KPI Widget -->
          <div class="mt-5">
            <app-branch-audit-kpi [branchId]="branchId" [from]="kpiFrom" [to]="kpiTo"></app-branch-audit-kpi>
          </div>

          <!-- AI Risk Score Widget -->
          <div class="mt-5">
            <app-ai-risk-score [branchId]="branchId" [year]="riskYear" [month]="riskMonth"></app-ai-risk-score>
          </div>
        </div>
      </ng-container>

      <!-- Not found -->
      <div *ngIf="!loading && !branch" class="text-center py-16">
        <p class="text-gray-500">Branch not found</p>
      </div>
    </div>
  `,
})
export class BranchDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  branchId = '';
  branch: any = null;
  loading = true;
  isMasterUser = false;

  activeTab: Tab = 'overview';
  tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'documents', label: 'Documents' },
    { key: 'mcd', label: 'MCD Schedule' },
    { key: 'contractors', label: 'Contractors' },
  ];

  // Documents
  documents: any[] = [];
  docsLoading = false;
  docCategoryFilter = '';
  docStatusFilter = '';

  // Upload
  uploadCategory = 'REGISTRATION';
  uploadDocType = '';
  uploadYear = new Date().getFullYear();
  uploadMonth = new Date().getMonth() + 1;
  selectedFile: File | null = null;
  uploading = false;
  uploadError = '';
  uploadSuccess = false;

  // Reupload
  reuploadTarget: any = null;
  reuploadFile: File | null = null;
  reuploading = false;

  // MCD
  mcdOverview: any[] = [];
  mcdLoading = false;

  // Dashboard
  dashboard: any = null;
  dashboardLoading = false;
  dashboardMonth = '';

  // Derived widget inputs
  get kpiFrom(): string {
    if (!this.dashboardMonth) return '';
    return this.dashboardMonth.slice(0, 4) + '-01';
  }
  get kpiTo(): string {
    return this.dashboardMonth;
  }
  get riskYear(): number {
    if (!this.dashboardMonth) return 0;
    return parseInt(this.dashboardMonth.slice(0, 4), 10);
  }
  get riskMonth(): number {
    if (!this.dashboardMonth) return 0;
    return parseInt(this.dashboardMonth.slice(5, 7), 10);
  }

  private monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  constructor(
    private svc: ClientBranchesService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
  ) {
    this.isMasterUser = this.auth.isMasterUser();
    // Default dashboard month to current YYYY-MM
    const now = new Date();
    this.dashboardMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  ngOnInit(): void {
    this.branchId = this.route.snapshot.paramMap.get('id') || '';
    this.loadBranch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranch(): void {
    this.loading = true;
    this.svc.getById(this.branchId).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => { this.loading = false; this.branch = res; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.branch = null; },
    });
  }

  onTabChange(): void {
    if (this.activeTab === 'documents' && !this.documents.length) this.loadDocuments();
    if (this.activeTab === 'mcd' && !this.mcdOverview.length) this.loadMcd();
    if (this.activeTab === 'dashboard' && !this.dashboard) this.loadDashboard();
  }

  /* ── Documents ───────────────────────── */

  loadDocuments(): void {
    this.docsLoading = true;
    this.svc.listDocuments(this.branchId, {
      category: this.docCategoryFilter || undefined,
      status: this.docStatusFilter || undefined,
    }).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.docsLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => { this.docsLoading = false; this.documents = res || []; },
      error: () => { this.docsLoading = false; this.documents = []; },
    });
  }

  onFileSelect(event: any): void {
    this.selectedFile = event.target?.files?.[0] ?? null;
  }

  uploadDocument(): void {
    if (!this.selectedFile || !this.uploadDocType) {
      this.uploadError = 'Please select a file and enter a document type';
      return;
    }
    this.uploading = true;
    this.uploadError = '';
    this.uploadSuccess = false;
    this.svc.uploadDocument(this.branchId, this.selectedFile, {
      category: this.uploadCategory,
      docType: this.uploadDocType,
      periodYear: this.uploadCategory === 'COMPLIANCE_MONTHLY' ? this.uploadYear : undefined,
      periodMonth: this.uploadCategory === 'COMPLIANCE_MONTHLY' ? this.uploadMonth : undefined,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.uploading = false;
        this.uploadSuccess = true;
        this.uploadDocType = '';
        this.selectedFile = null;
        this.loadDocuments();
        this.loadBranch(); // refresh counts
      },
      error: (err: any) => { this.uploading = false; this.uploadError = err?.error?.message || 'Upload failed'; },
    });
  }

  onReuploadFileSelect(event: any): void {
    this.reuploadFile = event.target?.files?.[0] ?? null;
  }

  doReupload(): void {
    if (!this.reuploadFile || !this.reuploadTarget) return;
    this.reuploading = true;
    this.svc.reuploadDocument(this.reuploadTarget.id, this.reuploadFile).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.reuploading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.reuploading = false;
        this.reuploadTarget = null;
        this.reuploadFile = null;
        this.loadDocuments();
      },
      error: () => { this.reuploading = false; /* stays open */ },
    });
  }

  /* ── MCD ─────────────────────────────── */

  loadMcd(): void {
    this.mcdLoading = true;
    this.svc.getMcdOverview(this.branchId, 6).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.mcdLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => { this.mcdLoading = false; this.mcdOverview = res || []; },
      error: () => { this.mcdLoading = false; this.mcdOverview = []; },
    });
  }

  monthName(m: number): string {
    return this.monthNames[(m - 1) % 12] || '';
  }

  /* ── Navigation ──────────────────────── */

  goBack(): void {
    this.router.navigate(['/client/branches']);
  }

  goToCompliance(): void {
    this.router.navigate(['/client/compliance/status'], { queryParams: { branchId: this.branchId } });
  }

  goToContractors(): void {
    this.router.navigate(['/client/contractors/branch', this.branchId]);
  }

  /* ── Dashboard ────────────────────────── */

  loadDashboard(): void {
    this.dashboardLoading = true;
    this.dashboard = null;
    this.svc.getDashboard(this.branchId, this.dashboardMonth || undefined).pipe(
      takeUntil(this.destroy$),
      timeout(15000),
      finalize(() => { this.dashboardLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => { this.dashboardLoading = false; this.dashboard = res; },
      error: () => { this.dashboardLoading = false; this.dashboard = null; },
    });
  }
}
