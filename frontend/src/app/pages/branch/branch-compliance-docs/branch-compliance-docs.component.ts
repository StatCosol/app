import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BranchComplianceFacade } from '../services/branch-compliance.facade';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { DataTableComponent, TableCellDirective, TableColumn } from '../../../shared/ui';

@Component({
  selector: 'app-branch-compliance-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, DataTableComponent, TableCellDirective],
  templateUrl: './branch-compliance-docs.component.html',
})
export class BranchComplianceDocsComponent implements OnInit {
  loading = false;
  uploading = false;

  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;

  get monthKey(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  kpis: any = null;
  checklistRows: any[] = [];
  returnMaster: any[] = [];

  readonly checklistColumns: TableColumn[] = [
    { key: 'name', header: 'Item' },
    { key: 'category', header: 'Category' },
    { key: 'dueDate', header: 'Due' },
    { key: 'status', header: 'Status' },
    { key: 'pct', header: '%', align: 'center' },
  ];

  // upload meta
  uploadCategory = '';
  uploadSubCategory = '';
  uploadReturnCode = '';
  uploadNotes = '';
  selectedFile: File | null = null;

  constructor(
    private facade: BranchComplianceFacade,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit() {
    this.loadAll();
    this.loadReturnMaster();
  }

  loadAll() {
    this.loading = true;

    this.facade.kpis(this.monthKey).subscribe({
      next: (res) => (this.kpis = res),
      error: () => this.toast.error('Failed to load dashboard KPIs.'),
    });

    this.facade.checklist(this.monthKey).subscribe({
      next: (res: any) => {
        this.checklistRows = Array.isArray(res) ? res : (res?.items || []);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Failed to load checklist. Please try again.');
      },
    });
  }

  onPeriodChange() {
    this.loadAll();
  }

  loadReturnMaster() {
    this.facade.returnMaster().subscribe({
      next: (res: any) => (this.returnMaster = Array.isArray(res) ? res : (res?.items || [])),
      error: () => this.toast.error('Failed to load return master.'),
    });
  }

  onFileChange(e: any) {
    this.selectedFile = e?.target?.files?.[0] || null;
  }

  /* ═══════ Defensive camelCase / snake_case helpers ═══════ */

  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  }

  getPct(row: any, camel: string, snake: string): number {
    return Number(this.pick(row, camel, snake) || 0);
  }

  clampPct(pct: number): number {
    const n = Number(pct || 0);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  pctClass(pct: number): string {
    const p = this.clampPct(pct);
    if (p < 50) return 'bg-red-100 text-red-800';
    if (p < 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  barClass(pct: number): string {
    const p = this.clampPct(pct);
    if (p < 50) return 'bg-red-500';
    if (p < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  async upload() {
    if (!this.selectedFile) {
      this.toast.error('Please choose a file to upload.');
      return;
    }

    const ok = await this.dialog.confirm('Upload Document', `Upload document for ${this.monthKey}?`);
    if (!ok) return;

    this.uploading = true;

    const meta: Record<string, any> = {
      monthKey: this.monthKey,
      category: this.uploadCategory || undefined,
      subCategory: this.uploadSubCategory || undefined,
      returnCode: this.uploadReturnCode || undefined,
      notes: this.uploadNotes?.trim() || undefined,
    };

    this.facade.upload(this.selectedFile, meta).subscribe({
      next: () => {
        this.uploading = false;
        this.toast.success('Uploaded successfully.');
        this.selectedFile = null;
        this.uploadNotes = '';
        this.loadAll();
      },
      error: () => {
        this.uploading = false;
        this.toast.error('Upload failed. Please try again.');
      },
    });
  }
}
