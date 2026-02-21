import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { FileDropzoneComponent } from '../../shared/file-dropzone.component';
import { ComplianceService } from '../../../../core/compliance.service';
import {
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
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
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './contractor-task-detail.component.html',
  styleUrls: ['../../shared/contractor-theme.scss', './contractor-task-detail.component.scss'],
})
export class ContractorTaskDetailComponent implements OnInit {
  id!: string;
  task: any;
  evidence: any[] = [];
  files: File[] = [];
  notes = '';

  loading = false;
  uploading = false;
  submitting = false;

  constructor(
    private route: ActivatedRoute,
    private api: ComplianceService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.id = String(this.route.snapshot.paramMap.get('id') || '');
    this.load();
  }

  load() {
    this.loading = true;
    this.api
      .contractorListTasks({})
      .pipe(
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          const list = res?.data || res || [];
          this.task = list.find((t: any) => String(t.id) === String(this.id));
          this.evidence = this.task?.evidence || [];
          this.cdr.detectChanges();
        },
        error: () => {
          this.cdr.detectChanges();
        },
      });
  }

  canEdit(): boolean {
    const s = (this.task?.status || '').toUpperCase();
    return s !== 'APPROVED' && s !== 'SUBMITTED';
  }

  async upload() {
    if (!this.files.length) return;
    this.uploading = true;

    this.api.contractorUploadEvidence(String(this.id), this.files[0], this.notes).subscribe({
      next: () => {
        this.files = [];
        this.notes = '';
        this.uploading = false;
        this.cdr.detectChanges();
        this.load();
      },
      error: () => {
        this.uploading = false;
        this.cdr.detectChanges();
      },
    });
  }

  submit() {
    if ((this.evidence?.length || 0) < 1) return;
    this.submitting = true;
    this.api.contractorSubmit(String(this.id)).subscribe({
      next: () => {
        this.submitting = false;
        this.cdr.detectChanges();
        this.load();
      },
      error: () => {
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }
}
