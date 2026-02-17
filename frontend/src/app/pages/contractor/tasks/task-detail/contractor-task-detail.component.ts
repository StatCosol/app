import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { FileDropzoneComponent } from '../../shared/file-dropzone.component';
import { ComplianceService } from '../../../../core/compliance.service';
import { 
  StatusBadgeComponent,
  ActionButtonComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent
} from '../../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-contractor-task-detail',
  imports: [
    CommonModule, 
    RouterModule, 
    FormsModule, 
    FileDropzoneComponent, 
    StatusBadgeComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  templateUrl: './contractor-task-detail.component.html',
  styleUrls: ['./contractor-task-detail.component.scss'],
})
export class ContractorTaskDetailComponent {
  id!: string;
  task: any;
  evidence: any[] = [];
  files: File[] = [];
  notes = '';

  loading = false;
  uploading = false;
  submitting = false;

  constructor(private route: ActivatedRoute, private api: ComplianceService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.id = String(this.route.snapshot.paramMap.get('id') || '');
    this.load();
  }

  
load() {
  this.loading = true;

  // Backend currently exposes:
  // GET /api/contractor/compliance/tasks
  // but does NOT expose GET /api/contractor/compliance/tasks/:id
  // So we load the list and pick the task by id.
  this.api.contractorListTasks({}).pipe(
    timeout(10000),
    finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
  ).subscribe({
    next: (res: any) => {
      const list = res?.data || res || [];
      this.task = list.find((t: any) => String(t.id) === String(this.id));
      this.evidence = this.task?.evidence || [];
      this.cdr.detectChanges();
    },
    error: () => { this.cdr.detectChanges(); },
  });
}

  canEdit(): boolean {
    const s = (this.task?.status || '').toUpperCase();
    return s !== 'APPROVED' && s !== 'SUBMITTED';
  }

  async upload() {
    if (!this.files.length) return;
    this.uploading = true;

    const form = new FormData();
    this.files.forEach(f => form.append('files', f));
    form.append('notes', this.notes || '');

    // You may need to adjust this to match your backend API
    this.api.contractorUploadEvidence(String(this.id), this.files[0], this.notes).subscribe({
      next: () => {
        this.files = [];
        this.notes = '';
        this.uploading = false;
        this.cdr.detectChanges();
        this.load();
      },
      error: () => { this.uploading = false; this.cdr.detectChanges(); }
    });
  }

  submit() {
    if ((this.evidence?.length || 0) < 1) return;
    this.submitting = true;
    this.api.contractorSubmit(String(this.id)).subscribe({
      next: () => { this.submitting = false; this.cdr.detectChanges(); this.load(); },
      error: () => { this.submitting = false; this.cdr.detectChanges(); }
    });
  }
}
