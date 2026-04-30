import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  PageHeaderComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
} from '../../../shared/ui';
import {
  ComplianceDocumentsService,
  ComplianceDocument,
  DocCategory,
} from '../../../core/compliance-documents.service';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  standalone: true,
  selector: 'app-client-compliance-library',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './client-compliance-library.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-compliance-library.component.scss'],
})
export class ClientComplianceLibraryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  isMasterUser = false;
  focusTitle = '';
  focusCode = '';
  branches: any[] = [];
  documents: ComplianceDocument[] = [];
  filteredDocs: ComplianceDocument[] = [];

  tabs: DocCategory[] = [
    { code: 'RETURN', label: 'Returns / Filings' },
    { code: 'REGISTER', label: 'Registers' },
    { code: 'LICENSE', label: 'Licenses' },
    { code: 'MCD', label: 'Monthly Compliance Docket' },
    { code: 'AUDIT_REPORT', label: 'Audit Reports' },
  ];
  activeTab = 'RETURN';
  tabCounts: Record<string, number> = {};

  subCategories: DocCategory[] = [];
  private subCategoryCache: Record<string, DocCategory[]> = {};

  filters: any = {
    branchId: '',
    subCategory: '',
    periodYear: null as number | null,
    periodMonth: null as number | null,
    search: '',
  };

  monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
  }));
  yearOptions = [
    new Date().getFullYear() - 1,
    new Date().getFullYear(),
    new Date().getFullYear() + 1,
  ];

  constructor(
    private readonly docsSvc: ComplianceDocumentsService,
    private readonly complianceSvc: ClientComplianceService,
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.isMasterUser = this.auth.isMasterUser();
  }

  ngOnInit() {
    this.applyQueryParams();
    this.loadBranches();
    this.loadSubCategories(this.activeTab);
    this.loadDocuments();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(tab: string) {
    this.activeTab = tab;
    this.filters.subCategory = '';
    this.loadSubCategories(tab);
    this.loadDocuments();
  }

  hasFocusContext(): boolean {
    return !!(this.focusTitle || this.focusCode || this.filters.branchId || this.filters.periodYear || this.filters.periodMonth);
  }

  focusSummary(): string {
    const label = this.focusTitle || this.focusCode || this.activeTab;
    const period = this.filters.periodMonth && this.filters.periodYear
      ? `${this.monthOptions[(this.filters.periodMonth || 1) - 1]?.label} ${this.filters.periodYear}`
      : this.filters.periodYear
        ? String(this.filters.periodYear)
        : '';
    if (period) {
      return `Showing ${label} documents for ${period}.`;
    }
    return `Showing ${label} documents.`;
  }

  loadBranches() {
    this.complianceSvc
      .getBranches()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.branches = res?.data || res || [];
          const userBranchIds = this.auth.getBranchIds();
          if (userBranchIds.length === 1) {
            this.filters.branchId = userBranchIds[0];
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.branches = [];
          this.cdr.detectChanges();
        },
      });
  }

  loadSubCategories(category: string) {
    if (this.subCategoryCache[category]) {
      this.subCategories = this.subCategoryCache[category];
      return;
    }
    this.docsSvc
      .getSubCategories(category)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : res?.data || [];
          this.subCategoryCache[category] = list;
          this.subCategories = list;
          this.cdr.detectChanges();
        },
        error: () => {
          this.subCategories = [];
          this.cdr.detectChanges();
        },
      });
  }

  loadDocuments() {
    this.loading = true;
    const params: Record<string, any> = {
      category: this.activeTab,
    };
    if (this.filters.branchId) params['branchId'] = this.filters.branchId;
    if (this.filters.subCategory) params['subCategory'] = this.filters.subCategory;
    if (this.filters.periodYear) params['periodYear'] = this.filters.periodYear;
    if (this.filters.periodMonth) params['periodMonth'] = this.filters.periodMonth;
    if (this.filters.search) params['search'] = this.filters.search;

    this.docsSvc
      .listForClient(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (docs) => {
          this.documents = Array.isArray(docs) ? docs : [];
          this.filteredDocs = this.documents;
          this.tabCounts[this.activeTab] = this.documents.length;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.documents = [];
          this.filteredDocs = [];
          this.toast.error(err?.error?.message || 'Failed to load documents');
          this.cdr.detectChanges();
        },
      });
  }

  getDownloadUrl(docId: string): string {
    return this.docsSvc.downloadUrl(docId);
  }

  getSubCategoryLabel(code: string): string {
    for (const list of Object.values(this.subCategoryCache)) {
      const found = list.find((sc) => sc.code === code);
      if (found) return found.label;
    }
    return code;
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private applyQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const category = params.get('category') || '';
    const subCategory = params.get('subCategory') || '';
    const branchId = params.get('branchId') || '';
    const periodYear = Number(params.get('periodYear') || '');
    const periodMonth = Number(params.get('periodMonth') || '');
    this.focusTitle = params.get('title') || '';
    this.focusCode = params.get('code') || '';

    if (category && this.tabs.some((tab) => tab.code === category)) {
      this.activeTab = category;
    }
    if (subCategory) this.filters.subCategory = subCategory;
    if (branchId) this.filters.branchId = branchId;
    if (periodYear >= 2020) this.filters.periodYear = periodYear;
    if (periodMonth >= 1 && periodMonth <= 12) this.filters.periodMonth = periodMonth;
  }
}
