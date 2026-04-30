import { Component, ChangeDetectorRef, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  PageHeaderComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  ClientContextStripComponent,
} from '../../../shared/ui';
import {
  ComplianceDocumentsService,
  ComplianceDocument,
  DocCategory,
} from '../../../core/compliance-documents.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  standalone: true,
  selector: 'app-crm-compliance-docs',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    DataTableComponent,
    TableCellDirective,
    ClientContextStripComponent,
  ],
  templateUrl: './crm-compliance-docs.component.html',
  styleUrls: ['./crm-compliance-docs.component.scss'],
})
export class CrmComplianceDocsComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  private destroy$ = new Subject<void>();

  loading = false;
  uploading = false;
  clientId = '';
  documents: ComplianceDocument[] = [];

  readonly docColumns: TableColumn[] = [
    { key: 'title', header: 'Title' },
    { key: 'category', header: 'Category' },
    { key: 'period', header: 'Period' },
    { key: 'file', header: 'File' },
    { key: 'createdAt', header: 'Uploaded' },
    { key: 'actions', header: 'Actions' },
  ];

  categories: DocCategory[] = [];
  subCategories: DocCategory[] = [];

  form: any = {
    category: '',
    subCategory: '',
    branchId: '',
    title: '',
    description: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    periodLabel: '',
  };
  selectedFile: File | null = null;

  filters: any = {
    category: '',
    subCategory: '',
    search: '',
  };

  monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
  }));
  yearOptions = [
    new Date().getFullYear() - 1,
    new Date().getFullYear(),
    new Date().getFullYear() + 1,
  ];

  showUploadForm = false;
  branches: any[] = [];

  constructor(
    private readonly docsSvc: ComplianceDocumentsService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Try to get clientId from route params for client-scoped pages
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['clientId']) {
        this.clientId = params['clientId'];
        this.loadDocuments();
      }
    });
    this.loadCategories();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCategories() {
    this.docsSvc.getCrmCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.categories = Array.isArray(res) ? res : res?.data || [];
        this.cdr.detectChanges();
      },
    });
  }

  onCategoryChange() {
    this.form.subCategory = '';
    this.subCategories = [];
    if (!this.form.category) return;
    this.docsSvc.getCrmSubCategories(this.form.category).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.subCategories = Array.isArray(res) ? res : res?.data || [];
        this.cdr.detectChanges();
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
    }
  }

  toggleUploadForm() {
    this.showUploadForm = !this.showUploadForm;
    if (this.showUploadForm) {
      this.resetForm();
    }
  }

  resetForm() {
    this.form = {
      category: '',
      subCategory: '',
      branchId: '',
      title: '',
      description: '',
      periodYear: new Date().getFullYear(),
      periodMonth: new Date().getMonth() + 1,
      periodLabel: '',
    };
    this.selectedFile = null;
    this.subCategories = [];
  }

  upload() {
    if (!this.selectedFile || !this.form.category || !this.form.title) {
      this.toast.error('Please fill all required fields and select a file');
      return;
    }

    const fd = new FormData();
    fd.append('file', this.selectedFile);
    fd.append('clientId', this.clientId);
    fd.append('category', this.form.category);
    if (this.form.subCategory) fd.append('subCategory', this.form.subCategory);
    if (this.form.branchId) fd.append('branchId', this.form.branchId);
    fd.append('title', this.form.title);
    if (this.form.description) fd.append('description', this.form.description);
    if (this.form.periodYear) fd.append('periodYear', String(this.form.periodYear));
    if (this.form.periodMonth) fd.append('periodMonth', String(this.form.periodMonth));
    if (this.form.periodLabel) fd.append('periodLabel', this.form.periodLabel);

    this.uploading = true;
    this.docsSvc
      .uploadForCrm(fd)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Document uploaded successfully');
          this.resetForm();
          this.showUploadForm = false;
          this.loadDocuments();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Upload failed');
        },
      });
  }

  loadDocuments() {
    if (!this.clientId) return;
    this.loading = true;
    const params: Record<string, any> = { clientId: this.clientId };
    if (this.filters.category) params['category'] = this.filters.category;
    if (this.filters.search) params['search'] = this.filters.search;

    this.docsSvc
      .listForCrm(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (docs) => {
          this.documents = Array.isArray(docs) ? docs : [];
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.documents = [];
          this.toast.error(err?.error?.message || 'Failed to load documents');
        },
      });
  }

  async deleteDoc(doc: ComplianceDocument) {
    if (!(await this.dialog.confirm('Delete Document', `Delete "${doc.title}"?`, { variant: 'danger', confirmText: 'Delete' }))) return;
    this.docsSvc
      .deleteCrmDoc(doc.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Document deleted');
          this.loadDocuments();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Delete failed');
        },
      });
  }

  getDownloadUrl(docId: string): string {
    return this.docsSvc.crmDownloadUrl(docId);
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getCategoryLabel(code: string): string {
    return this.categories.find((c) => c.code === code)?.label || code;
  }
}
