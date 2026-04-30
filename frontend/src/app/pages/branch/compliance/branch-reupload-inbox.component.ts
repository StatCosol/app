import { Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-branch-reupload-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch-reupload-inbox.component.html',
})
export class BranchReuploadInboxComponent implements OnInit {
  loading = false;
  rows: any[] = [];

  uploadingId: string | null = null;
  submittingId: string | null = null;

  selectedFile: Record<string, File | null> = {};
  note: Record<string, string> = {};
  statusTab: 'OPEN' | 'SUBMITTED' | 'REJECTED' | 'REVERIFIED' | 'ALL' = 'OPEN';
  q = '';

  showNaModal = false;
  naRow: any = null;
  naRemarks = '';
  markingNa = false;

  constructor(
    private api: ComplianceApiService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private zone: NgZone,
  ) {}

  ngOnInit() {
    this.load();
  }

  /* ═══════ Defensive camelCase / snake_case helpers ═══════ */

  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  }

  id(row: any): string {
    return this.pick(row, 'id', 'requestId', 'request_id') || '';
  }

  docId(row: any): string {
    return this.pick(row, 'docId', 'doc_id', 'documentId', 'document_id') || '';
  }

  title(row: any): string {
    return this.pick(row, 'title', 'docName', 'doc_name', 'documentType', 'document_type', 'name') || 'Document';
  }

  statusText(row: any): string {
    return this.pick(row, 'status') || '-';
  }

  remarksPreview(row: any): string {
    return this.pick(row, 'remarks', 'remarksVisible', 'remarksvisible', 'lastRemark', 'last_remark', 'reason') || '';
  }

  latestFileUrl(row: any): string | null {
    return this.pick(row, 'latestFileUrl', 'latest_file_url', 'fileUrl', 'file_url') || null;
  }

  unitName(row: any): string {
    return this.pick(row, 'unitName', 'unit_name', 'branchName', 'branch_name') || '';
  }

  deadlineDate(row: any): string | null {
    return this.pick(row, 'deadlineDate', 'deadline_date') || null;
  }

  isOverdue(row: any): boolean {
    const d = this.deadlineDate(row);
    if (!d) return false;
    return new Date(d) < new Date();
  }

  statusBadgeClass(row: any): string {
    const s = this.statusText(row);
    switch (s) {
      case 'OPEN': return 'bg-blue-100 text-blue-700';
      case 'SUBMITTED': return 'bg-yellow-100 text-yellow-800';
      case 'REVERIFIED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  /* ═══════ Filtering helpers ═══════ */

  private norm(v: string): string { return (v || '').trim().toLowerCase(); }

  private matchesSearch(row: any, query: string): boolean {
    if (!query) return true;
    return (
      this.norm(this.title(row)).includes(query) ||
      this.norm(this.docId(row)).includes(query) ||
      this.norm(this.remarksPreview(row)).includes(query) ||
      this.norm(this.unitName(row)).includes(query)
    );
  }

  private matchesTab(row: any): boolean {
    if (this.statusTab === 'ALL') return true;
    return this.norm(this.statusText(row)) === this.norm(this.statusTab);
  }

  private static readonly STATUS_ORDER: Record<string, number> = {
    OPEN: 0, REJECTED: 1, SUBMITTED: 2, REVERIFIED: 3,
  };

  get filteredRows(): any[] {
    const q = this.norm(this.q);
    return this.rows
      .filter(r => this.matchesTab(r) && this.matchesSearch(r, q))
      .sort((a, b) => {
        const sa = BranchReuploadInboxComponent.STATUS_ORDER[this.statusText(a)] ?? 9;
        const sb = BranchReuploadInboxComponent.STATUS_ORDER[this.statusText(b)] ?? 9;
        if (sa !== sb) return sa - sb;
        const da = new Date(this.pick(a, 'updatedAt', 'updated_at') || 0).getTime();
        const db = new Date(this.pick(b, 'updatedAt', 'updated_at') || 0).getTime();
        return db - da;
      });
  }

  get tabCounts(): Record<string, number> {
    const c: Record<string, number> = { OPEN: 0, SUBMITTED: 0, REJECTED: 0, REVERIFIED: 0, ALL: this.rows.length };
    for (const r of this.rows) {
      const s = this.norm(this.statusText(r)).toUpperCase();
      if (s in c) c[s]++;
    }
    return c;
  }

  tabLabel(status: string): string {
    return `${status} (${this.tabCounts[status] ?? 0})`;
  }

  /* ═══════ Status guardrails ═══════ */

  canUpload(row: any): boolean {
    const s = this.statusText(row);
    return s === 'OPEN' || s === 'REJECTED';
  }

  canSubmit(row: any): boolean {
    return this.canUpload(row) && !!this.latestFileUrl(row);
  }

  statusHint(row: any): string {
    switch (this.statusText(row)) {
      case 'OPEN':      return 'Upload the corrected file, then click Submit.';
      case 'SUBMITTED': return 'Awaiting auditor re-verification.';
      case 'REJECTED':  return 'Auditor rejected — upload a new version.';
      case 'REVERIFIED': return 'Closed — verified by auditor.';
      default:          return '';
    }
  }

  setTab(tab: 'OPEN' | 'SUBMITTED' | 'REJECTED' | 'REVERIFIED' | 'ALL') {
    this.statusTab = tab;
  }

  load() {
    this.loading = true;
    // Safety net: if the request truly hangs (network stall, interceptor swallow,
    // change-detection miss outside Angular zone), force the spinner off after 20s.
    const watchdog = setTimeout(() => {
      if (this.loading) {
        this.zone.run(() => { this.loading = false; });
      }
    }, 20000);
    this.api.branchListReuploadRequests({})
      .pipe(finalize(() => {
        clearTimeout(watchdog);
        // Ensure loading flips even if next/error never fired (e.g. unsubscribe).
        this.zone.run(() => { this.loading = false; });
      }))
      .subscribe({
        next: (res: any) => {
          this.rows = Array.isArray(res) ? res : (res?.data || res?.items || []);
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.toast.error('Failed to load reupload requests.');
        },
      });
  }

  onFileChange(reqId: string, e: any) {
    this.selectedFile[reqId] = e?.target?.files?.[0] || null;
  }

  async upload(row: any) {
    const reqId = this.id(row);
    const f = this.selectedFile[reqId];

    if (!reqId) { this.toast.error('Request ID missing.'); return; }
    if (!f) { this.toast.error('Choose a file first.'); return; }

    const ok = await this.dialog.confirm('Upload Corrected Document', 'Upload the corrected document now?');
    if (!ok) return;

    this.uploadingId = reqId;

    this.api.branchReuploadUpload(reqId, f, (this.note[reqId] || '').trim() || undefined).subscribe({
      next: () => {
        this.uploadingId = null;
        this.toast.success('File uploaded.');
        this.load();
      },
      error: () => {
        this.uploadingId = null;
        this.toast.error('Upload failed.');
      },
    });
  }

  async submit(row: any) {
    const reqId = this.id(row);
    if (!reqId) { this.toast.error('Request ID missing.'); return; }

    const ok = await this.dialog.confirm('Submit Reupload', 'Submit the reuploaded document for re-verification?');
    if (!ok) return;

    this.submittingId = reqId;

    this.api.branchReuploadSubmit(reqId).subscribe({
      next: () => {
        this.submittingId = null;
        this.toast.success('Submitted for verification.');
        this.load();
      },
      error: () => {
        this.submittingId = null;
        this.toast.error('Submit failed.');
      },
    });
  }

  openNaModal(row: any): void {
    this.naRow = row;
    this.naRemarks = '';
    this.showNaModal = true;
  }

  closeNaModal(): void {
    this.showNaModal = false;
    this.naRow = null;
    this.naRemarks = '';
  }

  submitMarkNa(): void {
    const reqId = this.id(this.naRow);
    if (!reqId || !this.naRemarks.trim()) return;

    this.markingNa = true;
    this.api.branchReuploadMarkNotApplicable(reqId, this.naRemarks.trim()).subscribe({
      next: () => {
        this.markingNa = false;
        this.toast.success('Marked as Not Applicable');
        this.closeNaModal();
        this.load();
      },
      error: (err: any) => {
        this.markingNa = false;
        this.toast.error(err?.error?.message || 'Failed. Please try again.');
      },
    });
  }
}
