import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-client-reupload-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-reupload-inbox.component.html',
})
export class ClientReuploadInboxComponent implements OnInit {
  loading = false;
  rows: any[] = [];

  uploadingId: string | null = null;
  submittingId: string | null = null;

  selectedFile: Record<string, File | null> = {};
  note: Record<string, string> = {};
  statusTab: 'OPEN' | 'SUBMITTED' | 'REJECTED' | 'REVERIFIED' | 'ALL' = 'OPEN';
  q = '';

  constructor(
    private api: ComplianceApiService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
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

  private static readonly STATUS_ORDER: Record<string, number> = {
    OPEN: 0, REJECTED: 1, SUBMITTED: 2, REVERIFIED: 3,
  };

  get filteredRows(): any[] {
    return (this.rows || [])
      .filter(r => this.matchesTab(r) && this.matchesSearch(r, this.q))
      .sort((a, b) => {
        const sa = ClientReuploadInboxComponent.STATUS_ORDER[this.statusText(a)] ?? 9;
        const sb = ClientReuploadInboxComponent.STATUS_ORDER[this.statusText(b)] ?? 9;
        if (sa !== sb) return sa - sb;
        const da = new Date(this.pick(a, 'updatedAt', 'updated_at') || 0).getTime();
        const db = new Date(this.pick(b, 'updatedAt', 'updated_at') || 0).getTime();
        return db - da; // most recent first
      });
  }

  /* ═══════ Search + tab helpers ═══════ */

  private norm(v: any): string {
    return String(v ?? '').toLowerCase().trim();
  }

  private matchesSearch(row: any, query: string): boolean {
    if (!query) return true;
    const q = this.norm(query);
    const hay = [
      this.norm(this.title(row)),
      this.norm(this.docId(row)),
      this.norm(this.remarksPreview(row)),
      this.norm(this.id(row)),
    ].join(' | ');
    return hay.includes(q);
  }

  private matchesTab(row: any): boolean {
    if (this.statusTab === 'ALL') return true;
    return this.statusText(row) === this.statusTab;
  }

  /* ═══════ Tab counts ═══════ */

  get tabCounts(): Record<string, number> {
    const rows = this.rows || [];
    const by = (s: string) => rows.filter(r => this.statusText(r) === s).length;
    return {
      OPEN: by('OPEN'),
      SUBMITTED: by('SUBMITTED'),
      REJECTED: by('REJECTED'),
      REVERIFIED: by('REVERIFIED'),
      ALL: rows.length,
    };
  }

  tabLabel(status: 'OPEN' | 'SUBMITTED' | 'REJECTED' | 'REVERIFIED' | 'ALL'): string {
    const c = (this.tabCounts as any)[status] ?? 0;
    return `${status} (${c})`;
  }

  /* ═══════ Status guardrails ═══════ */

  canUpload(row: any): boolean {
    const s = this.statusText(row);
    return s === 'OPEN' || s === 'REJECTED';
  }

  canSubmit(row: any): boolean {
    if (!this.canUpload(row)) return false;
    return !!this.latestFileUrl(row);
  }

  statusHint(row: any): string {
    const s = this.statusText(row);
    if (s === 'SUBMITTED') return 'Submitted for verification.';
    if (s === 'REVERIFIED') return 'Verified and closed.';
    if (s === 'REJECTED') return 'Rejected \u2014 upload corrected file and submit again.';
    return '';
  }

  setTab(tab: any) {
    this.statusTab = tab;
  }

  load() {
    this.loading = true;
    this.api.clientListReuploadRequests({}).subscribe({
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

    this.api.clientReuploadUpload(reqId, f, (this.note[reqId] || '').trim() || undefined).subscribe({
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

    this.api.clientReuploadSubmit(reqId).subscribe({
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
}
