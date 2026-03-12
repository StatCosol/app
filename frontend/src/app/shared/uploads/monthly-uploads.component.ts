import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { ClientBranchesService } from '../../core/client-branches.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../toast/toast.service';
import { ConfirmDialogService } from '../ui/confirm-dialog/confirm-dialog.service';

interface ComplianceItem {
  code: string;
  name: string;
  module: string;       // MCD | RETURNS
  frequency: string;
  priority: string;
  dueDate?: string;
  windowOpen?: string;
  windowClose?: string;
}

interface UploadedDoc {
  id: string;
  code: string;
  fileName: string;
  uploadedAt: string;
}

@Component({
  standalone: true,
  selector: 'app-monthly-uploads',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monthly-uploads.component.html',
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
    .title { font-size: 18px; font-weight: 800; margin: 0; color: #0f172a; }
    .sub { margin-top: 4px; color: #64748b; font-size: 12px; }
    .controls { display: flex; gap: 10px; flex-wrap: wrap; }
    input, select { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #fff; font-size: 13px; }
    .card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .section { background: #fff; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden; }
    .section-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 2px solid #f1f5f9; }
    .section-title { font-size: 14px; font-weight: 800; color: #0f172a; }
    .section-badge { display: inline-flex; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .section-badge.mcd { background: #dbeafe; color: #1e40af; }
    .section-badge.returns { background: #fef3c7; color: #92400e; }
    .item { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; }
    .item:last-child { border-bottom: none; }
    .item-name { font-weight: 800; font-size: 13px; color: #0f172a; }
    .item-meta { color: #64748b; font-size: 11px; margin-top: 2px; }
    .item-focus { background: #fffbeb; }
    .badge { display: inline-flex; padding: 3px 8px; border-radius: 999px; font-weight: 800; font-size: 11px; }
    .LOW { background: #dcfce7; color: #166534; }
    .MEDIUM { background: #fef3c7; color: #92400e; }
    .HIGH { background: #fee2e2; color: #991b1b; }
    .CRITICAL { background: #fecaca; color: #7f1d1d; outline: 2px solid rgba(220,38,38,.35); }
    .upload-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .doc-chip { display: inline-flex; align-items: center; gap: 6px; background: #f0fdf4; border: 1px solid #bbf7d0;
                border-radius: 8px; padding: 4px 10px; font-size: 12px; color: #166534; font-weight: 600; }
    .doc-chip button { background: none; border: none; color: #dc2626; cursor: pointer; font-size: 14px; font-weight: 800; line-height: 1; }
    .muted { color: #94a3b8; font-size: 12px; }
    .progress-bar { height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden; margin-bottom: 16px; }
    .progress-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
    .progress-fill.green { background: #22c55e; }
    .progress-fill.amber { background: #f59e0b; }
    .empty-state { padding: 40px; text-align: center; color: #94a3b8; font-size: 13px; }
    @media (max-width: 900px) { .card-grid { grid-template-columns: 1fr; } }
  `]
})
export class MonthlyUploadsComponent implements OnInit, OnDestroy {
  month = '';
  branchId = '';
  branches: { id: string; name: string }[] = [];

  loading = false;
  stateCode: string | null = null;
  establishmentType: string | null = null;

  mcdItems: ComplianceItem[] = [];
  returnsItems: ComplianceItem[] = [];

  /** Uploaded documents keyed by compliance code */
  docsByCode: Record<string, UploadedDoc[]> = {};

  focusCode = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private api: ClientBranchesService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    this.month = params['month'] || this.toYYYYMM(new Date());
    this.focusCode = params['code'] || '';

    if (params['branchId']) {
      this.branchId = params['branchId'];
    }

    const mapped = this.auth.getBranchIds();
    if (mapped?.length) {
      if (!this.branchId) this.branchId = mapped[0];
      this.branches = mapped.map(id => ({ id, name: 'Branch' }));
      this.load();
      this.api.list().subscribe({
        next: (b: any[]) => {
          const nameMap = new Map((b || []).map((x: any) => [x.id, x.name || x.branchName || x.title || 'Branch']));
          this.branches = mapped.map(id => ({ id, name: nameMap.get(id) || 'Branch' }));
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.api.list().subscribe({
      next: (b: any[]) => {
        this.branches = (b || []).map(x => ({
          id: x.id,
          name: x.name || x.branchName || x.title || 'Branch',
        }));
        if (!this.branchId) this.branchId = this.branches[0]?.id || '';
        this.cdr.markForCheck();
        this.load();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    if (!this.branchId) return;
    this.loading = true;
    this.cdr.markForCheck();

    this.api.getBranchComplianceItems(this.branchId, this.month).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res: any) => {
        this.stateCode = res.stateCode ?? null;
        this.establishmentType = res.establishmentType ?? null;
        const all: ComplianceItem[] = res.items || [];
        this.mcdItems = all.filter(i => i.module === 'MCD');
        this.returnsItems = all.filter(i => i.module === 'RETURNS');
        this.loadDocs();
      },
      error: () => {
        this.mcdItems = [];
        this.returnsItems = [];
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private loadDocs(): void {
    this.api.getMonthlyDocuments(this.branchId, this.month).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (docs: UploadedDoc[]) => {
        this.docsByCode = this.groupDocs(docs);
      },
      error: () => {
        this.docsByCode = {};
      }
    });
  }

  /** File input handler — immediately uploads */
  onFileSelected(event: Event, item: ComplianceItem): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    this.api.uploadMonthlyDocument({
      branchId: this.branchId,
      month: this.month,
      code: item.code,
      file,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        input.value = '';
        this.loadDocs();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Upload failed');
        input.value = '';
      }
    });
  }

  async deleteDoc(doc: UploadedDoc): Promise<void> {
    if (!(await this.dialog.confirm('Delete Document', `Delete "${doc.fileName}"?`, { variant: 'danger', confirmText: 'Delete' }))) return;
    this.api.deleteMonthlyDocument(doc.id).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => this.loadDocs(),
      error: (err: any) => this.toast.error(err?.error?.message || 'Delete failed'),
    });
  }

  /** Group documents array by compliance code */
  private groupDocs(docs: UploadedDoc[]): Record<string, UploadedDoc[]> {
    const map: Record<string, UploadedDoc[]> = {};
    for (const d of docs) {
      (map[d.code] ??= []).push(d);
    }
    return map;
  }

  /** Compute upload progress for a set of items */
  computeProgress(items: ComplianceItem[]): { uploaded: number; total: number } {
    let uploaded = 0;
    for (const it of items) {
      if (this.docsByCode[it.code]?.length) uploaded++;
    }
    return { uploaded, total: items.length };
  }

  progressPercent(items: ComplianceItem[]): number {
    const p = this.computeProgress(items);
    return p.total ? Math.round((p.uploaded / p.total) * 100) : 0;
  }

  get allItems(): ComplianceItem[] {
    return [...this.mcdItems, ...this.returnsItems];
  }

  get overallProgress(): number {
    return this.progressPercent(this.allItems);
  }

  private toYYYYMM(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
}