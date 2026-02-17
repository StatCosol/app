import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, StatusBadgeComponent } from '../../../shared/ui';
import { ReturnsService } from '../../../core/returns.service';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { AuthService } from '../../../core/auth.service';
import { SimpleToastService } from '../../../core/simple-toast.service';

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
export class ClientReturnsComponent {
  isMasterUser = false;
  singleBranch = false;
  loading = false;
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
    periodMonth: new Date().getMonth() + 1,
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
    private readonly toast: SimpleToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.isMasterUser = this.auth.isMasterUser();
  }

  ngOnInit() {
    this.loadTypes();
    this.loadBranches();
  }

  loadTypes() {
    this.returnsSvc.listTypes().subscribe({
      next: (res: any) => {
        this.types = res?.data || res || [];
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadBranches() {
    this.complianceSvc.getBranches().subscribe({
      next: (res: any) => {
        this.branches = res?.data || res || [];
        const userBranchIds = this.auth.getBranchIds();
        if (userBranchIds.length === 1) {
          this.filters.branchId = userBranchIds[0];
          this.newFiling.branchId = userBranchIds[0];
          this.singleBranch = true;
        } else if (!this.filters.branchId && this.branches.length) {
          this.filters.branchId = this.branches[0].id;
        }
        this.cdr.detectChanges();
        this.loadFilings();
      },
      error: () => {
        this.branches = [];
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
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.filings = res?.data || res || [];
          this.cdr.detectChanges();
        },
        error: () => {
          this.filings = [];
          this.cdr.detectChanges();
        },
      });
  }

  create() {
    if (!this.newFiling.branchId || !this.newFiling.returnType) {
      this.toast.show('Select branch and return type');
      return;
    }
    const chosen = this.types.find((t) => t.code === this.newFiling.returnType);
    const payload = {
      clientId: this.auth.getUser()?.clientId,
      branchId: this.newFiling.branchId,
      returnType: chosen?.label || this.newFiling.returnType,
      lawType: chosen?.lawType || this.newFiling.lawType || 'GENERAL',
      periodYear: Number(this.newFiling.periodYear),
      periodMonth: Number(this.newFiling.periodMonth),
    };
    this.creating = true;
    this.returnsSvc
      .createFiling(payload)
      .pipe(
        finalize(() => {
          this.creating = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.show('Return created');
          this.loadFilings();
        },
        error: () => {
          this.toast.show('Could not create return');
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
        finalize(() => {
          entry[kind] = false;
          if (input) input.value = '';
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.show(`${kind === 'ack' ? 'Acknowledgement' : 'Challan'} uploaded`);
          this.loadFilings();
        },
        error: () => this.toast.show('Upload failed'),
      });
  }

  submit(filing: Filing) {
    this.submitting[filing.id] = true;
    this.returnsSvc
      .submitFiling(filing.id)
      .pipe(
        finalize(() => {
          this.submitting[filing.id] = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.show('Submitted for review');
          this.loadFilings();
        },
        error: () => this.toast.show('Submit failed'),
      });
  }

  periodText(f: Filing) {
    if (f.periodLabel) return f.periodLabel;
    if (!f.periodMonth || !f.periodYear) return `${f.periodYear}`;
    const name = this.monthOptions.find((m) => m.value === Number(f.periodMonth))?.label;
    return `${name} ${f.periodYear}`;
  }

  canUpload(): boolean {
    return !this.isMasterUser;
  }

  branchName(f: Filing): string {
    if (f.branchName) return f.branchName;
    const branch = this.branches?.find((b) => b?.id === f.branchId);
    return branch?.branchName || branch?.name || 'Branch';
  }
}
