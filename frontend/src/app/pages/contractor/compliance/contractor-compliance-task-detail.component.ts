import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  ActionButtonComponent,
  StatusBadgeComponent,
  FormInputComponent,
  LoadingSpinnerComponent,
} from '../../../shared/ui';

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

@Component({
  selector: 'app-contractor-compliance-task-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionButtonComponent,
    StatusBadgeComponent,
    FormInputComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './contractor-compliance-task-detail.component.html',
})
export class ContractorComplianceTaskDetailComponent implements OnInit {
  loading = false;
  taskId = '';
  task: any = null;

  comment = '';
  uploading = false;
  uploadProgress = 0;
  selectedFile: File | null = null;
  fileNote = '';
  fileError = '';

  readonly allowedExtensions = ALLOWED_EXTENSIONS;
  readonly maxFileSizeMb = MAX_FILE_SIZE_MB;

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

  load() {
    this.loading = true;
    this.api.contractorGetTask(this.taskId).subscribe({
      next: (res) => {
        this.task = res;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Failed to load task.');
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

  statusText(): string {
    return this.pick(this.task, 'status') || '-';
  }

  taskName(): string {
    return this.pick(this.task, 'taskName', 'task_name', 'name', 'complianceName', 'compliance_name') || '-';
  }

  dueDate(): string {
    return this.pick(this.task, 'dueDate', 'due_date') || '-';
  }

  async start() {
    const ok = await this.dialog.confirm('Start Task', 'Start this task now?');
    if (!ok) return;

    this.api.contractorStartTask(this.taskId).subscribe({
      next: () => {
        this.toast.success('Task started.');
        this.load();
      },
      error: () => this.toast.error('Failed to start task.'),
    });
  }

  async submit() {
    const ok = await this.dialog.confirm('Submit Task', 'Submit this task for review?');
    if (!ok) return;

    this.api.contractorSubmitTask(this.taskId).subscribe({
      next: () => {
        this.toast.success('Task submitted.');
        this.load();
      },
      error: () => this.toast.error('Failed to submit task.'),
    });
  }

  async addComment() {
    const text = (this.comment || '').trim();
    if (!text) {
      this.toast.error('Enter a comment.');
      return;
    }

    this.api.contractorAddComment(this.taskId, text).subscribe({
      next: () => {
        this.toast.success('Comment added.');
        this.comment = '';
        this.load();
      },
      error: () => this.toast.error('Failed to add comment.'),
    });
  }

  onFileChange(e: any) {
    this.fileError = '';
    const file: File | null = e?.target?.files?.[0] || null;

    if (!file) {
      this.selectedFile = null;
      return;
    }

    // Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      this.fileError = `Invalid file type ".${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
      this.selectedFile = null;
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.fileError = `File too large (${this.formatFileSize(file.size)}). Maximum allowed: ${MAX_FILE_SIZE_MB}MB`;
      this.selectedFile = null;
      return;
    }

    this.selectedFile = file;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async uploadEvidence() {
    if (!this.selectedFile) {
      this.toast.error('Choose a file first.');
      return;
    }

    if (this.fileError) {
      this.toast.error(this.fileError);
      return;
    }

    const ok = await this.dialog.confirm('Upload Evidence', 'Upload this evidence file?');
    if (!ok) return;

    this.uploading = true;
    this.uploadProgress = 0;

    // Simulate progress for UX (actual upload is not XHR with progress events here)
    const progressInterval = setInterval(() => {
      if (this.uploadProgress < 90) {
        this.uploadProgress += Math.random() * 15;
      }
    }, 300);

    const meta = this.fileNote?.trim() ? { note: this.fileNote.trim() } : {};

    this.api.contractorUploadEvidence(this.taskId, this.selectedFile, meta).subscribe({
      next: () => {
        clearInterval(progressInterval);
        this.uploadProgress = 100;
        setTimeout(() => {
          this.uploading = false;
          this.uploadProgress = 0;
          this.toast.success('Evidence uploaded successfully.');
          this.selectedFile = null;
          this.fileNote = '';
          this.fileError = '';
          this.load();
        }, 500);
      },
      error: () => {
        clearInterval(progressInterval);
        this.uploading = false;
        this.uploadProgress = 0;
        this.toast.error('Evidence upload failed. Please try again.');
      },
    });
  }
}
