import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ContractorProfileApiService } from '../../core/contractor-profile-api.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  DataTableComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
  TableCellDirective,
  TableColumn,
} from '../../shared/ui';

interface StatutoryRow {
  key: string;
  label: string;
  status: 'AVAILABLE' | 'MISSING' | 'EXPIRING';
  value: string;
  expiryDate: string | null;
  updatedAt: string | null;
}

interface ServedBranchRow {
  branchName: string;
  complianceItems: number;
  riskBand: 'HIGH' | 'MEDIUM' | 'LOW';
}

@Component({
  selector: 'app-contractor-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    DataTableComponent,
    TableCellDirective,
  ],
  templateUrl: './contractor-profile.component.html',
  styleUrls: ['./contractor-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorProfileComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  profile: any = null;
  branches: any[] = [];
  documents: any[] = [];
  statutoryRows: StatutoryRow[] = [];

  loading = true;
  saving = false;
  error: string | null = null;

  form = {
    name: '',
    mobile: '',
  };

  docColumns: TableColumn[] = [
    { key: 'title', header: 'Document', sortable: true },
    { key: 'docType', header: 'Type', width: '180px' },
    { key: 'status', header: 'Status', width: '120px', align: 'center' },
    { key: 'expiryDate', header: 'Expiry', width: '140px' },
    { key: 'updatedAt', header: 'Updated', width: '160px' },
  ];

  contactColumns: TableColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'designation', header: 'Designation', width: '160px' },
    { key: 'email', header: 'Email', width: '220px' },
    { key: 'mobile', header: 'Mobile', width: '140px' },
    { key: 'isSignatory', header: 'Signatory', width: '120px', align: 'center' },
  ];

  servedBranchColumns: TableColumn[] = [
    { key: 'branchName', header: 'Branch' },
    { key: 'complianceItems', header: 'Compliance Items', align: 'center', width: '170px' },
    { key: 'riskBand', header: 'Risk Band', align: 'center', width: '130px' },
  ];

  constructor(
    private readonly api: ContractorProfileApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    forkJoin({
      profile: this.api.getContractorProfile(),
      dashboard: this.api.getContractorBranches(),
      documents: this.api.getContractorDocuments({ limit: 200 }),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ profile, dashboard, documents }) => {
          this.profile = profile || {};
          this.form.name = this.profile?.name || '';
          this.form.mobile = this.profile?.mobile || '';
          this.branches = Array.isArray(dashboard?.branches)
            ? dashboard.branches
            : [];
          this.documents = this.toArray(documents).map((row: any) => ({
            ...row,
            title: row?.title || row?.fileName || '-',
            updatedAt: row?.updatedAt || row?.createdAt || row?.created_at || null,
          }));
          this.statutoryRows = this.buildStatutoryRows(this.documents);
          this.error = null;
        },
        error: (err: any) => {
          this.error =
            err?.error?.message || 'Failed to load contractor profile workspace.';
          this.profile = null;
          this.branches = [];
          this.documents = [];
          this.statutoryRows = [];
        },
      });
  }

  saveProfile(): void {
    if (this.saving || !this.canSaveProfile) {
      if (!this.canSaveProfile) {
        this.toast.error(this.profileGuardrails[0] || 'Please correct highlighted fields.');
      }
      return;
    }
    this.saving = true;
    this.api
      .updateContractorProfile({
        name: (this.form.name || '').trim(),
        mobile: (this.form.mobile || '').trim() || null,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (updated: any) => {
          this.profile = {
            ...(this.profile || {}),
            ...(updated || {}),
          };
          this.toast.success('Changes saved successfully.');
        },
        error: (err: any) => {
          this.toast.error(err?.error?.message || 'Could not update profile.');
        },
      });
  }

  get servedBranchesCount(): number {
    return this.branches.length;
  }

  get isNameValid(): boolean {
    return (this.form.name || '').trim().length >= 3;
  }

  get isMobileValid(): boolean {
    const value = (this.form.mobile || '').trim();
    if (!value) return true;
    return /^[0-9]{10}$/.test(value);
  }

  get isDirty(): boolean {
    return (
      (this.form.name || '').trim() !== String(this.profile?.name || '').trim() ||
      (this.form.mobile || '').trim() !== String(this.profile?.mobile || '').trim()
    );
  }

  get canSaveProfile(): boolean {
    return this.isDirty && this.isNameValid && this.isMobileValid;
  }

  get statutoryMissingCount(): number {
    return this.statutoryRows.filter((row) => row.status === 'MISSING').length;
  }

  get statutoryExpiringCount(): number {
    return this.statutoryRows.filter((row) => row.status === 'EXPIRING').length;
  }

  get profileCompletenessPct(): number {
    const checks = [
      !!String(this.profile?.name || '').trim(),
      !!String(this.profile?.email || '').trim(),
      !!String(this.profile?.mobile || '').trim(),
      this.branches.length > 0,
      this.statutoryRows.some((row) => row.key === 'PF' && row.status === 'AVAILABLE'),
      this.statutoryRows.some((row) => row.key === 'ESI' && row.status === 'AVAILABLE'),
      this.statutoryRows.some((row) => row.key === 'LABOUR_LICENSE' && row.status === 'AVAILABLE'),
    ];
    const achieved = checks.filter(Boolean).length;
    return Math.round((achieved / checks.length) * 100);
  }

  get profileGuardrails(): string[] {
    const issues: string[] = [];
    if (!this.isNameValid) {
      issues.push('Company/contractor name should be at least 3 characters.');
    }
    if (!this.isMobileValid) {
      issues.push('Mobile number should be 10 digits.');
    }
    if (this.statutoryMissingCount > 0) {
      issues.push(`${this.statutoryMissingCount} statutory identity records are missing.`);
    }
    if (this.statutoryExpiringCount > 0) {
      issues.push(`${this.statutoryExpiringCount} statutory records are expiring/expired.`);
    }
    if (!this.branches.length) {
      issues.push('No served branch mapping found.');
    }
    return issues;
  }

  get servedBranchRows(): ServedBranchRow[] {
    const rows: ServedBranchRow[] = (this.branches || []).map((branch) => {
      const branchName = branch?.branchName || branch?.name || branch?.id || '-';
      const complianceItems = Array.isArray(branch?.compliances) ? branch.compliances.length : 0;
      const riskBand: ServedBranchRow['riskBand'] =
        complianceItems > 18 ? 'HIGH' : complianceItems > 8 ? 'MEDIUM' : 'LOW';
      return { branchName, complianceItems, riskBand };
    });
    return rows.sort((a, b) => b.complianceItems - a.complianceItems);
  }

  get primaryContactRows(): any[] {
    if (!this.profile) return [];
    return [
      {
        name: this.profile?.name || '-',
        designation: 'Primary Contact',
        email: this.profile?.email || '-',
        mobile: this.profile?.mobile || '-',
        isSignatory: 'Yes',
      },
    ];
  }

  get topRecentDocuments(): any[] {
    return [...this.documents]
      .sort((a, b) => this.dateValue(b.updatedAt) - this.dateValue(a.updatedAt))
      .slice(0, 10);
  }

  isExpiringSoon(dateStr: string): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
  }

  riskBandClass(riskBand: ServedBranchRow['riskBand']): string {
    if (riskBand === 'HIGH') return 'risk-band risk-band--high';
    if (riskBand === 'MEDIUM') return 'risk-band risk-band--medium';
    return 'risk-band risk-band--low';
  }

  isExpired(dateStr: string): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildStatutoryRows(docs: any[]): StatutoryRow[] {
    return [
      this.toStatutoryRow('PF', 'PF Code / Documents', docs, (t) =>
        t.includes('pf') || t.includes('provident'),
      ),
      this.toStatutoryRow('ESI', 'ESI Code / Documents', docs, (t) =>
        t.includes('esi') || t.includes('insurance'),
      ),
      this.toStatutoryRow('LABOUR_LICENSE', 'Labour License', docs, (t) =>
        t.includes('license') || t.includes('licence') || t.includes('labour'),
      ),
    ];
  }

  private toStatutoryRow(
    key: string,
    label: string,
    docs: any[],
    matcher: (type: string) => boolean,
  ): StatutoryRow {
    const matches = docs
      .filter((d) => matcher(String(d?.docType || '').toLowerCase()))
      .sort(
        (a, b) =>
          this.dateValue(b?.updatedAt || b?.createdAt) -
          this.dateValue(a?.updatedAt || a?.createdAt),
      );

    const latest = matches[0];
    if (!latest) {
      return {
        key,
        label,
        status: 'MISSING',
        value: 'Not available',
        expiryDate: null,
        updatedAt: null,
      };
    }

    const expiryDate = latest?.expiryDate || latest?.expiresAt || null;
    const status = this.isExpired(expiryDate)
      ? 'EXPIRING'
      : this.isExpiringSoon(expiryDate)
      ? 'EXPIRING'
      : 'AVAILABLE';

    return {
      key,
      label,
      status,
      value: latest?.title || latest?.fileName || latest?.docType || 'Available',
      expiryDate,
      updatedAt: latest?.updatedAt || latest?.createdAt || null,
    };
  }

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  private dateValue(value: string | null): number {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
}
