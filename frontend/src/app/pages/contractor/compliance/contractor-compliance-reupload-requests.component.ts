import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-contractor-compliance-reupload-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contractor-compliance-reupload-requests.component.html',
})
export class ContractorComplianceReuploadRequestsComponent implements OnInit {
  loading = false;
  rows: any[] = [];

  uploadingId: string | null = null;
  submittingId: string | null = null;

  selectedFile: Record<string, File | null> = {};
  note: Record<string, string> = {};

  constructor(
    private api: ComplianceApiService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.api.contractorGetReuploadRequests().subscribe({
      next: (res: any) => {
        this.rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Failed to load reupload requests.');
      },
    });
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

  onFileChange(reqId: string, e: any) {
    this.selectedFile[reqId] = e?.target?.files?.[0] || null;
  }

  async viewRemarks(row: any) {
    const dId = this.docId(row);
    if (!dId) {
      this.toast.error('Doc ID missing.');
      return;
    }

    this.api.contractorGetDocRemarks(dId).subscribe({
      next: async (res: any) => {
        const msg = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
        await this.dialog.confirm('Remarks', msg);
      },
      error: () => this.toast.error('Failed to fetch remarks.'),
    });
  }

  async upload(row: any) {
    const reqId = this.id(row);
    const f = this.selectedFile[reqId];

    if (!reqId) {
      this.toast.error('Request ID missing.');
      return;
    }
    if (!f) {
      this.toast.error('Choose a file first.');
      return;
    }

    const ok = await this.dialog.confirm('Upload Reupload File', 'Upload the corrected document now?');
    if (!ok) return;

    this.uploadingId = reqId;

    this.api.contractorReuploadUpload(reqId, f, (this.note[reqId] || '').trim() || undefined).subscribe({
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
    if (!reqId) {
      this.toast.error('Request ID missing.');
      return;
    }

    const ok = await this.dialog.confirm('Submit Reupload', 'Submit the reuploaded document for re-verification?');
    if (!ok) return;

    this.submittingId = reqId;

    this.api.contractorReuploadSubmit(reqId).subscribe({
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
