import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-auditor-compliance-task-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auditor-compliance-task-detail.component.html',
})
export class AuditorComplianceTaskDetailComponent implements OnInit {
  loading = false;
  taskId = '';
  task: any = null;

  // docs / evidence attached to this task
  docs: any[] = [];

  // per-doc remarks + decision
  remarks: Record<string, string> = {};
  decision: Record<string, 'COMPLIED' | 'NEEDS_REUPLOAD'> = {};

  submitting = false;

  constructor(
    private route: ActivatedRoute,
    private api: ComplianceApiService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit() {
    this.taskId = this.route.snapshot.paramMap.get('id') || '';
    this.load();
  }

  /* ═══════ Defensive camelCase / snake_case helpers ═══════ */

  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  }

  docId(row: any): string {
    return this.pick(row, 'id', 'docId', 'doc_id') || '';
  }

  docName(row: any): string {
    return this.pick(row, 'name', 'docName', 'doc_name', 'fileName', 'file_name') || 'Document';
  }

  docUrl(row: any): string {
    return this.pick(row, 'downloadUrl', 'download_url', 'url', 'fileUrl', 'file_url') || '';
  }

  taskName(): string {
    return this.pick(this.task, 'taskName', 'task_name', 'name', 'complianceName', 'compliance_name') || '-';
  }

  dueDate(): string {
    return this.pick(this.task, 'dueDate', 'due_date') || '-';
  }

  statusText(): string {
    return this.pick(this.task, 'status') || '-';
  }

  load() {
    this.loading = true;

    this.api.auditorGetTask(this.taskId).subscribe({
      next: (res: any) => {
        this.task = res;

        // Try to find docs inside response
        const embeddedDocs = this.pick<any[]>(res, 'docs', 'documents', 'evidence');
        if (Array.isArray(embeddedDocs)) {
          this.docs = embeddedDocs;
          this.loading = false;
          return;
        }

        // Fallback: load docs list separately
        this.api.auditorGetDocs({ q: this.taskId }).subscribe({
          next: (docsRes: any) => {
            this.docs = Array.isArray(docsRes) ? docsRes : (docsRes?.items || docsRes?.data || []);
            this.loading = false;
          },
          error: () => {
            this.docs = [];
            this.loading = false;
            this.toast.error('Failed to load docs.');
          },
        });
      },
      error: () => {
        this.loading = false;
        this.toast.error('Failed to load task details.');
      },
    });
  }

  download(row: any) {
    const u = this.docUrl(row);
    if (!u) {
      this.toast.error('Download link not available.');
      return;
    }
    window.open(u, '_blank');
  }

  // ===== Submit Review =====
  async submitReview() {
    const ok = await this.dialog.confirm(
      'Submit Review',
      'Create reupload requests for selected documents?',
    );
    if (!ok) return;

    const items = this.docs
      .map((d) => {
        const dId = this.docId(d);
        const dec = this.decision[dId] || 'COMPLIED';
        const rem = (this.remarks[dId] || '').trim();

        if (dec !== 'NEEDS_REUPLOAD') return null;
        if (!rem || rem.length < 5) return { invalid: true, docId: dId };
        return { docId: dId, remarks: rem };
      })
      .filter(Boolean) as any[];

    if (!items.length) {
      this.toast.error('No documents marked as "Needs Reupload".');
      return;
    }

    const invalid = items.find((x: any) => x.invalid);
    if (invalid) {
      this.toast.error('Remarks required (min 5 chars) for each reupload item.');
      return;
    }

    this.submitting = true;
    this.api.auditorCreateReuploadRequests({ taskId: this.taskId, items }).subscribe({
      next: () => {
        this.submitting = false;
        this.toast.success('Reupload request(s) created.');
        this.load();
      },
      error: () => {
        this.submitting = false;
        this.toast.error('Failed to submit review. Please try again.');
      },
    });
  }
}
