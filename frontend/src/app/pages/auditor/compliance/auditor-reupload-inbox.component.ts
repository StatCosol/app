import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-auditor-reupload-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auditor-reupload-inbox.component.html',
})
export class AuditorReuploadInboxComponent implements OnInit {
  loading = false;
  requests: any[] = [];
  statusFilter = 'SUBMITTED';

  // per-row remarks for rejection
  rejectRemarks: Record<string, string> = {};
  processing: Record<string, boolean> = {};

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

  reqId(r: any): string {
    return this.pick(r, 'id') || '';
  }

  docName(r: any): string {
    return this.pick(r, 'documentName', 'document_name', 'fileName', 'file_name') || `Doc #${this.docId(r)}`;
  }

  docId(r: any): string {
    return String(this.pick(r, 'documentId', 'document_id') || '');
  }

  reason(r: any): string {
    return this.pick(r, 'reason', 'remarksVisible', 'remarksvisible') || '-';
  }

  status(r: any): string {
    return this.pick(r, 'status') || '-';
  }

  clientId(r: any): string {
    return this.pick(r, 'clientId', 'client_id') || '';
  }

  contractorId(r: any): string {
    return this.pick(r, 'contractorUserId', 'contractor_user_id') || '-';
  }

  submittedAt(r: any): string {
    return this.pick(r, 'submittedAt', 'submitted_at') || '-';
  }

  latestFileName(r: any): string {
    const lu = this.pick<any>(r, 'latestUpload', 'latest_upload');
    if (!lu) return '-';
    return lu.fileName || lu.file_name || '-';
  }

  latestFilePath(r: any): string {
    const lu = this.pick<any>(r, 'latestUpload', 'latest_upload');
    if (!lu) return '';
    return lu.filePath || lu.file_path || '';
  }

  deadlineDate(r: any): string | null {
    return this.pick(r, 'deadlineDate', 'deadline_date') || null;
  }

  daysLeft(r: any): number | null {
    return this.pick(r, 'daysLeft', 'days_left') ?? null;
  }

  isOverdue(r: any): boolean {
    return this.pick(r, 'isOverdue', 'is_overdue') === true;
  }

  isDueSoon(r: any): boolean {
    return this.pick(r, 'isDueSoon', 'is_due_soon') === true;
  }

  slaBadge(r: any): { label: string; cls: string } | null {
    if (this.isOverdue(r)) return { label: 'OVERDUE', cls: 'bg-red-100 text-red-700' };
    if (this.isDueSoon(r)) return { label: 'DUE SOON', cls: 'bg-amber-100 text-amber-700' };
    return null;
  }

  load() {
    this.loading = true;
    this.api.auditorListReuploadRequests({ status: this.statusFilter }).subscribe({
      next: (res: any) => {
        this.requests = Array.isArray(res) ? res : (res?.data || []);
        this.loading = false;
      },
      error: () => {
        this.requests = [];
        this.loading = false;
        this.toast.error('Failed to load reupload requests.');
      },
    });
  }

  onFilterChange() {
    this.load();
  }

  download(r: any) {
    const path = this.latestFilePath(r);
    if (!path) {
      this.toast.error('No uploaded file available.');
      return;
    }
    window.open(`/api/v1/files/${encodeURIComponent(path)}`, '_blank');
  }

  async approve(r: any) {
    const id = this.reqId(r);
    const ok = await this.dialog.confirm('Approve Reupload', `Accept re-uploaded document "${this.docName(r)}"?`);
    if (!ok) return;

    this.processing[id] = true;
    this.api.auditorApproveReupload(id).subscribe({
      next: () => {
        this.processing[id] = false;
        this.toast.success('Reupload approved.');
        this.load();
      },
      error: () => {
        this.processing[id] = false;
        this.toast.error('Failed to approve.');
      },
    });
  }

  async reject(r: any) {
    const id = this.reqId(r);
    const remarks = (this.rejectRemarks[id] || '').trim();
    if (!remarks || remarks.length < 5) {
      this.toast.error('Please provide rejection remarks (min 5 chars).');
      return;
    }

    const ok = await this.dialog.confirm(
      'Reject Reupload',
      `Reject document "${this.docName(r)}" and create a new reupload request for the contractor?`,
    );
    if (!ok) return;

    this.processing[id] = true;
    this.api.auditorRejectReupload(id, remarks).subscribe({
      next: () => {
        this.processing[id] = false;
        this.rejectRemarks[id] = '';
        this.toast.success('Reupload rejected — new request sent to contractor.');
        this.load();
      },
      error: () => {
        this.processing[id] = false;
        this.toast.error('Failed to reject.');
      },
    });
  }

  statusBadge(r: any): string {
    const s = this.status(r);
    switch (s) {
      case 'SUBMITTED': return 'bg-yellow-100 text-yellow-800';
      case 'OPEN': return 'bg-blue-100 text-blue-800';
      case 'REVERIFIED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'CLOSED': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}
