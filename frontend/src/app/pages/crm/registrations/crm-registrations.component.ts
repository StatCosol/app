import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientContextStripComponent } from '../../../shared/ui';

type ComputedStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';

interface RegForm {
  branchId: string;
  type: string;
  registrationNumber: string;
  authority: string;
  issuedDate: string;
  expiryDate: string;
}

@Component({
  selector: 'app-crm-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientContextStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-registrations.component.html',
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:12px; }
    .title { font-size: 18px; font-weight: 700; color:#0f172a; margin:0; }
    .sub { margin:4px 0 0; font-size: 12px; color:#64748b; }
    .toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    select, input { border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; font-size: 13px; background:#fff; }
    .btn { border: 1px solid #e2e8f0; border-radius: 8px; padding:7px 10px; font-size: 12px; background:#0f172a; color:#fff; cursor:pointer; white-space:nowrap; }
    .btn.secondary { background:#fff; color:#0f172a; }
    .btn.danger { background:#b91c1c; border-color:#b91c1c; color:#fff; }
    .btn.sm { padding:5px 8px; font-size:11px; }
    .btn:disabled { opacity:.6; cursor:not-allowed; }

    .strip { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin: 12px 0 14px; }
    .card { background:#fff; border:1px solid #f1f5f9; border-radius:14px; padding:14px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
    .value { font-size: 22px; font-weight: 800; }
    .label { font-size: 11px; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-top:4px; font-weight:600; }

    .tableWrap { background:#fff; border:1px solid #f1f5f9; border-radius:16px; overflow-x:auto; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
    table { width:100%; border-collapse:collapse; min-width:960px; }
    th { text-align:left; background:#f8fafc; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.04em; padding:10px 10px; border-bottom:2px solid #f1f5f9; white-space:nowrap; }
    td { padding:10px 10px; border-bottom:1px solid #f8fafc; font-size: 13px; color:#0f172a; vertical-align:middle; }
    td.actions-cell { white-space:nowrap; }
    tr:hover td { background:#f8fafc; }
    .muted { color:#64748b; font-size:12px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }

    .badge { display:inline-flex; padding:4px 10px; border-radius:999px; font-weight:700; font-size:12px; }
    .bA { background:#d1fae5; color:#065f46; }
    .bS { background:#fef3c7; color:#92400e; }
    .bE { background:#fee2e2; color:#991b1b; }

    .drawer { margin-top: 14px; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:14px; }
    .drawerHead { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap; }
    .drawerTitle { font-weight:800; color:#0f172a; }
    .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
    @media(max-width: 900px){ .strip{grid-template-columns:repeat(2,1fr);} .grid{grid-template-columns:1fr;} }
    label { font-size: 12px; color:#64748b; font-weight:600; display:block; margin: 0 0 6px; }
    .note { margin-top:12px; font-size:12px; color:#64748b; background:#eff6ff; border:1px solid #dbeafe; padding:10px 12px; border-radius:12px; }
  `]
})
export class CrmRegistrationsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  clientId = '';
  branches: any[] = [];
  selectedBranchId = '';

  statusFilter: 'all' | ComputedStatus = 'all';
  q = '';

  loading = false;

  rows: any[] = [];
  filtered: any[] = [];

  active = 0;
  expiring = 0;
  expired = 0;

  // form / drawer
  showForm = false;
  editingId: string | null = null;

  form: RegForm = this.emptyForm();

  regTypes = [
    'Shops & Establishment',
    'Factory License',
    'PF Code',
    'ESI Code',
    'Professional Tax (PT)',
    'CLRA License',
    'Trade License',
    'GST Registration',
    'BOCW Registration',
    'FSSAI License',
    'Fire NOC',
    'Pollution NOC',
    'Other',
  ];

  saving = false;
  deletingId: string | null = null;
  documentFile: File | null = null;
  existingDocumentUrl: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly branchSvc: ClientBranchesService,
    private readonly crmClientsApi: CrmClientsApi,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.clientId = params.get('clientId') ?? '';
      if (this.clientId) this.loadBranches();
    });
  }

  private loadBranches(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.crmClientsApi.getBranchesForClient(this.clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (b) => {
          this.branches = (b || []).map((x: any) => ({
            id: x.id,
            name: x.name || x.branchName || x.title || 'Branch',
          }));
          this.selectedBranchId = this.branches[0]?.id || '';
          this.loading = false;
          this.cdr.markForCheck();
          if (this.selectedBranchId) this.load();
        },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
  }

  load(): void {
    if (!this.selectedBranchId || !this.clientId) {
      this.rows = [];
      this.filtered = [];
      this.computeCounts();
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    this.branchSvc.crmListRegistrations(this.selectedBranchId, this.clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.rows = r || [];
          this.computeCounts();
          this.applyFilters();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
  }

  applyFilters(): void {
    const qq = (this.q || '').trim().toLowerCase();
    let data = [...this.rows];

    if (this.statusFilter !== 'all') {
      data = data.filter(x => x.computedStatus === this.statusFilter);
    }

    if (qq) {
      data = data.filter((x: any) => {
        const s = [x.type, x.registrationNumber, x.authority, x.computedStatus]
          .filter(Boolean).join(' ').toLowerCase();
        return s.includes(qq);
      });
    }

    this.filtered = data;
    this.cdr.markForCheck();
  }

  openCreate(): void {
    if (!this.selectedBranchId) return;
    this.editingId = null;
    this.showForm = true;
    this.form = this.emptyForm();
    this.form.branchId = this.selectedBranchId;
    this.documentFile = null;
    this.existingDocumentUrl = null;
    this.cdr.markForCheck();
  }

  openEdit(row: any): void {
    this.editingId = row.id;
    this.showForm = true;
    this.form = {
      branchId: row.branchId || this.selectedBranchId,
      type: row.type || '',
      registrationNumber: row.registrationNumber || '',
      authority: row.authority || '',
      issuedDate: this.toDateInput(row.issuedDate),
      expiryDate: this.toDateInput(row.expiryDate),
    };
    this.documentFile = null;
    this.existingDocumentUrl = row.documentUrl || null;
    this.cdr.markForCheck();
  }

  closeForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.saving = false;
    this.documentFile = null;
    this.existingDocumentUrl = null;
    this.cdr.markForCheck();
  }

  save(): void {
    if (!this.form.branchId || !this.form.type?.trim()) {
      this.toast.error('Branch and Registration/License Type are required.');
      return;
    }

    const payload: any = {
      branchId: this.form.branchId,
      type: this.form.type.trim(),
      registrationNumber: this.form.registrationNumber?.trim() || null,
      authority: this.form.authority?.trim() || null,
      issuedDate: this.form.issuedDate || null,
      expiryDate: this.form.expiryDate || null,
    };

    this.saving = true;
    this.cdr.markForCheck();

    const req$ = this.editingId
      ? this.branchSvc.updateRegistration(this.editingId, this.clientId, payload)
      : this.branchSvc.createRegistration(this.clientId, payload);

    req$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const savedId = this.editingId || res?.id;
        if (this.documentFile && savedId) {
          const fd = new FormData();
          fd.append('file', this.documentFile);
          this.branchSvc.uploadRegistrationFile(savedId, this.clientId, fd, 'document')
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.saving = false;
                this.showForm = false;
                this.editingId = null;
                this.documentFile = null;
                this.existingDocumentUrl = null;
                this.load();
              },
              error: () => {
                this.saving = false;
                this.cdr.markForCheck();
                this.toast.error('Saved but document upload failed');
                this.showForm = false;
                this.editingId = null;
                this.load();
              },
            });
        } else {
          this.saving = false;
          this.showForm = false;
          this.editingId = null;
          this.documentFile = null;
          this.existingDocumentUrl = null;
          this.load();
        }
      },
      error: (e) => {
        this.saving = false;
        this.cdr.markForCheck();
        this.toast.error(e?.error?.message || 'Save failed');
      },
    });
  }

  async deleteRow(row: any): Promise<void> {
    if (!(await this.dialog.confirm('Delete Registration', `Delete "${row.type}"?`, { variant: 'danger', confirmText: 'Delete' }))) return;

    this.deletingId = row.id;
    this.cdr.markForCheck();

    this.branchSvc.deleteRegistration(row.id, this.clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingId = null;
          this.load();
        },
        error: (e) => {
          this.deletingId = null;
          this.cdr.markForCheck();
          this.toast.error(e?.error?.message || 'Delete failed');
        },
      });
  }

  onFormFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.documentFile = input.files?.[0] ?? null;
    this.cdr.markForCheck();
    input.value = '';
  }

  removeFormFile(): void {
    this.documentFile = null;
    this.cdr.markForCheck();
  }

  uploadFile(event: any, row: any, field: 'document' | 'renewal' = 'document'): void {
    const file = event.target?.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    this.branchSvc.uploadRegistrationFile(row.id, this.clientId, formData, field)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.load(),
        error: () => this.toast.error('Upload failed'),
      });

    // Reset input so same file can be re-selected
    event.target.value = '';
  }

  badgeClass(s: ComputedStatus): string {
    if (s === 'EXPIRED') return 'badge bE';
    if (s === 'EXPIRING_SOON') return 'badge bS';
    return 'badge bA';
  }

  statusLabel(s: ComputedStatus): string {
    if (s === 'EXPIRED') return 'Expired';
    if (s === 'EXPIRING_SOON') return 'Expiring Soon';
    return 'Active';
  }

  trackById(_: number, item: any): string { return item.id; }

  private computeCounts(): void {
    this.active = this.rows.filter(x => x.computedStatus === 'ACTIVE').length;
    this.expiring = this.rows.filter(x => x.computedStatus === 'EXPIRING_SOON').length;
    this.expired = this.rows.filter(x => x.computedStatus === 'EXPIRED').length;
  }

  private toDateInput(d: any): string {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private emptyForm(): RegForm {
    return { branchId: '', type: '', registrationNumber: '', authority: '', issuedDate: '', expiryDate: '' };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
