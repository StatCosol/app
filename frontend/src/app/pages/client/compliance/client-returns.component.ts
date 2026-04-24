import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, StatusBadgeComponent } from '../../../shared/ui';
import { ReturnsService } from '../../../core/returns.service';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ComplianceContextService } from '../../../core/services/compliance-context.service';

type Filing = {
  id: string;
  branchId: string | null;
  branchName?: string;
  lawType: string;
  returnType: string;
  periodYear: number;
  periodMonth?: number | null;
  periodLabel?: string | null;
  dueDate?: string | null;
  filedDate?: string | null;
  status: string;
  ackNumber?: string | null;
  ackFilePath?: string | null;
  challanFilePath?: string | null;
};

@Component({
  standalone: true,
  selector: 'app-client-returns',
  imports: [CommonModule, FormsModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, StatusBadgeComponent],
  templateUrl: './client-returns.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-returns.component.scss'],
})
export class ClientReturnsComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  isMasterUser = false;
  singleBranch = false;
  loading = true;
  focusCode = '';
  creating = false;
  submitting: Record<string, boolean> = {};
  uploading: Record<string, { ack?: boolean; challan?: boolean }> = {};

  branches: any[] = [];
  filings: Filing[] = [];
  types: any[] = [];

  filters: any = {
    branchId: '',
    status: '',
    periodYear: new Date().getFullYear(),
    periodMonth: '',
    returnType: '',
  };

  newFiling: any = {
    branchId: '',
    returnType: '',
    lawType: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
  };

  monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }) }));
  yearOptions = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  constructor(
    private readonly returnsSvc: ReturnsService,
    private readonly complianceSvc: ClientComplianceService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly complianceContext: ComplianceContextService,
  ) {
    this.isMasterUser = this.auth.isMasterUser();
    const user = this.auth.getUser();
    if (user) {
      this.complianceContext.setContext({
        role: 'CLIENT',
        clientId: user.clientId || null,
        clientCode: user.clientName || null,
        branchId: null,
        branchCode: null,
      });
    }
  }

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const branchId = params.get('branchId') || '';
    const code = params.get('code') || '';
    const month = Number(params.get('periodMonth') || params.get('month')?.split('-')[1] || '');
    const year = Number(params.get('year') || params.get('month')?.split('-')[0] || '');
    this.focusCode = this.normalizeReturnCode(code);
    if (branchId) {
      this.filters.branchId = branchId;
      this.newFiling.branchId = branchId;
    }
    if (month >= 1 && month <= 12) {
      this.filters.periodMonth = month;
      this.newFiling.periodMonth = month;
    }
    if (year >= 2000) {
      this.filters.periodYear = year;
      this.newFiling.periodYear = year;
    }
    if (this.focusCode) {
      this.filters.returnType = this.focusCode;
      this.newFiling.returnType = this.focusCode;
    }
    this.loadTypes();
    this.loadBranches();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTypes() {
    this.returnsSvc.listTypes().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.types = res?.data || res || [];
        if (this.focusCode && !this.types.some((t) => t.code === this.focusCode)) {
          this.focusCode = '';
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.types = [];
        this.toast.error('Failed to load return types');
        this.cdr.detectChanges();
      },
    });
  }

  loadBranches() {
    this.complianceSvc.getBranches().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.branches = res?.data || res || [];
        const userBranchIds = this.auth.getBranchIds();
        if (userBranchIds.length === 1) {
          this.filters.branchId = userBranchIds[0];
          this.newFiling.branchId = userBranchIds[0];
          this.singleBranch = true;
        } else if (!this.isMasterUser && !this.filters.branchId && this.branches.length) {
          this.filters.branchId = this.branches[0].id;
        }
        this.cdr.detectChanges();
        this.loadFilings();
      },
      error: () => {
        this.branches = [];
        this.toast.error('Failed to load branches');
        this.cdr.detectChanges();
        this.loadFilings();
      },
    });
  }

  loadFilings() {
    this.loading = true;
    this.returnsSvc
      .listFilings(this.filters)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.loading = false;
          this.filings = res?.data || res || [];
          if (this.focusCode && !this.newFiling.returnType) {
            this.newFiling.returnType = this.focusCode;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.filings = [];
          this.toast.error('Failed to load filings');
          this.cdr.detectChanges();
        },
      });
  }

  create() {
    if (!this.newFiling.branchId || !this.newFiling.returnType) {
      this.toast.info('Select branch and return type');
      return;
    }
    const chosen = this.types.find((t) => t.code === this.newFiling.returnType);
    const payload = {
      clientId: this.auth.getUser()?.clientId,
      branchId: this.newFiling.branchId,
      returnType: chosen?.code || this.newFiling.returnType,
      lawType: chosen?.lawType || this.newFiling.lawType || 'GENERAL',
      periodYear: Number(this.newFiling.periodYear),
      periodMonth: Number(this.newFiling.periodMonth),
    };
    this.creating = true;
    this.returnsSvc
      .createFiling(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.creating = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.creating = false;
          this.toast.info('Return created');
          // Sync list filters to match the newly created filing so it appears
          if (this.newFiling.branchId) this.filters.branchId = this.newFiling.branchId;
          if (this.newFiling.periodYear) this.filters.periodYear = this.newFiling.periodYear;
          if (this.newFiling.periodMonth) this.filters.periodMonth = this.newFiling.periodMonth;
          this.loadFilings();
        },
        error: (err) => {
          this.creating = false;
          this.toast.error(err?.error?.message || 'Could not create return');
        },
      });
  }

  upload(kind: 'ack' | 'challan', filing: Filing, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const entry = (this.uploading[filing.id] = this.uploading[filing.id] || {});
    entry[kind] = true;
    const obs = kind === 'ack'
      ? this.returnsSvc.uploadAck(filing.id, file, filing.ackNumber || undefined)
      : this.returnsSvc.uploadChallan(filing.id, file);

    obs
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          entry[kind] = false;
          if (input) input.value = '';
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          entry[kind] = false;
          this.toast.info(`${kind === 'ack' ? 'Acknowledgement' : 'Challan'} uploaded`);
          this.loadFilings();
        },
        error: (err) => { entry[kind] = false; this.toast.error(err?.error?.message || 'Upload failed'); },
      });
  }

  submit(filing: Filing) {
    this.submitting[filing.id] = true;
    this.returnsSvc
      .submitFiling(filing.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.submitting[filing.id] = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.submitting[filing.id] = false;
          this.toast.info('Submitted for review');
          this.loadFilings();
        },
        error: (err) => { this.submitting[filing.id] = false; this.toast.error(err?.error?.message || 'Submit failed'); },
      });
  }

  periodText(f: Filing) {
    if (f.periodLabel) return f.periodLabel;
    if (!f.periodMonth || !f.periodYear) return `${f.periodYear}`;
    const name = this.monthOptions.find((m) => m.value === Number(f.periodMonth))?.label;
    return `${name} ${f.periodYear}`;
  }

  canUpload(): boolean {
    return true;
  }

  branchName(f: Filing): string {
    if (f.branchName) return f.branchName;
    const branch = this.branches?.find((b) => b?.id === f.branchId);
    return branch?.branchName || branch?.name || 'Branch';
  }

  hasFocusTarget(): boolean {
    return !!this.focusCode;
  }

  focusLabel(): string {
    const match = this.types.find((t) => t.code === this.focusCode);
    return match?.label || this.focusCode;
  }

  isFocusedFiling(filing: Filing): boolean {
    if (!this.focusCode) return false;
    return this.normalizeReturnCode(filing.returnType) === this.focusCode;
  }

  hasFocusedFiling(): boolean {
    if (!this.focusCode) return false;
    return this.filings.some((filing) => this.isFocusedFiling(filing));
  }

  private normalizeReturnCode(value: unknown): string {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return '';
    const tokens = normalized
      .replace(/&/g, 'AND')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const knownCodes = ['PF', 'ESI', 'PT', 'LWF', 'GST', 'TDS', 'ROC'];
    const match = knownCodes.find((code) => tokens.includes(code));
    return match || normalized.replace(/[^A-Z0-9]+/g, '');
  }
}
