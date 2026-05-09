import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AuditsService } from '../../core/audits.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../shared/toast/toast.service';

interface VendorNcRow {
  id: string;
  documentName: string | null;
  remark: string | null;
  status: string;
  vendorWindowUntil: string | null;
  isOverdue: boolean;
  publishedAt: string | null;
}

@Component({
  selector: 'app-vendor-audit-ncs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-wrap">
      <header class="page-head card">
        <div>
          <h1>Audit Non-Compliances</h1>
          <p>Re-upload corrected evidence for each item below before the closure deadline. Items past the deadline are flagged as overdue.</p>
        </div>
      </header>

      <div *ngIf="loading" class="loader">Loading non-compliances...</div>

      <section class="card" *ngIf="!loading">
        <div *ngIf="!publishedAt" style="padding:14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;color:#92400e;font-size:13px;">
          Preliminary findings have not been published for this audit yet. There is nothing to act on at the moment.
        </div>

        <ng-container *ngIf="publishedAt">
          <div class="kv-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:14px;">
            <div><span style="font-size:11px;color:#64748b;">Published</span><strong style="display:block;">{{ formatDate(publishedAt) }}</strong></div>
            <div><span style="font-size:11px;color:#64748b;">Closure Window</span><strong style="display:block;">{{ vendorWindowDays || '-' }} day(s)</strong></div>
            <div><span style="font-size:11px;color:#64748b;">Total NCs</span><strong style="display:block;">{{ counts.total || 0 }}</strong></div>
            <div><span style="font-size:11px;color:#64748b;">Open</span><strong style="display:block;">{{ counts.open || 0 }}</strong></div>
            <div><span style="font-size:11px;color:#64748b;color:#b91c1c;">Overdue</span><strong style="display:block;color:#b91c1c;">{{ counts.overdue || 0 }}</strong></div>
          </div>

          <div *ngIf="!items.length" style="padding:18px;text-align:center;color:#64748b;">No non-compliances visible.</div>

          <div *ngFor="let nc of items; trackBy: trackById" class="nc-row" style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:10px;" [style.background]="nc.isOverdue ? '#fef2f2' : 'white'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
              <div style="flex:1;min-width:240px;">
                <strong style="font-size:13px;">{{ nc.documentName || 'Document' }}</strong>
                <div style="font-size:12px;color:#475569;margin-top:4px;">{{ nc.remark || '-' }}</div>
                <div style="margin-top:6px;font-size:11px;color:#64748b;">
                  Status: <strong>{{ nc.status }}</strong> &middot; Deadline:
                  <strong [style.color]="nc.isOverdue ? '#b91c1c' : '#0f172a'">{{ nc.vendorWindowUntil || '-' }}</strong>
                  <span *ngIf="nc.isOverdue" style="margin-left:8px;color:#b91c1c;font-weight:600;">OVERDUE</span>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                <input type="file" #fileInput (change)="onFile($event, nc)" [disabled]="uploadingId === nc.id" />
                <button type="button" class="btn btn-primary" style="font-size:12px;padding:4px 10px;" [disabled]="!pending[nc.id] || uploadingId === nc.id" (click)="upload(nc)">
                  {{ uploadingId === nc.id ? 'Uploading...' : 'Upload Correction' }}
                </button>
              </div>
            </div>
          </div>
        </ng-container>
      </section>
    </div>
  `,
  styles: [`
    .page-wrap { padding: 16px; max-width: 1100px; margin: 0 auto; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 14px; }
    .page-head h1 { margin: 0 0 4px; font-size: 20px; }
    .page-head p { margin: 0; color: #64748b; font-size: 13px; }
    .btn { border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #2563eb; color: white; border-color: #2563eb; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .loader { padding: 14px; text-align: center; color: #64748b; }
  `],
})
export class VendorAuditNcsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  auditId: string | null = null;
  scope: 'contractor' | 'branch' = 'contractor';
  loading = true;
  publishedAt: string | null = null;
  vendorWindowDays: number | null = null;
  counts: { total?: number; open?: number; overdue?: number } = {};
  items: VendorNcRow[] = [];
  pending: Record<string, File | null> = {};
  uploadingId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private auditsApi: AuditsService,
    private auth: AuthService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const role = (this.auth.getRoleCode() || '').toUpperCase();
    this.scope = role === 'CLIENT' ? 'branch' : 'contractor';
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((p) => {
      this.auditId = p.get('id');
      if (this.auditId) this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    if (!this.auditId) return;
    this.loading = true;
    const obs$ = this.scope === 'branch'
      ? this.auditsApi.branchListNcsForAudit(this.auditId)
      : this.auditsApi.contractorListNcsForAudit(this.auditId);
    obs$.pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: (res: any) => {
        this.publishedAt = res?.publishedAt || null;
        this.vendorWindowDays = res?.vendorWindowDays ?? null;
        this.counts = res?.counts || {};
        this.items = res?.items || [];
        this.pending = {};
      },
      error: (err) => this.toast.error(err?.error?.message || 'Failed to load non-compliances'),
    });
  }

  onFile(ev: Event, nc: VendorNcRow): void {
    const file = (ev.target as HTMLInputElement).files?.[0] || null;
    this.pending[nc.id] = file;
  }

  upload(nc: VendorNcRow): void {
    const file = this.pending[nc.id];
    if (!file || this.uploadingId) return;
    this.uploadingId = nc.id;
    const obs$ = this.scope === 'branch'
      ? this.auditsApi.branchUploadCorrectedFile(nc.id, file)
      : this.auditsApi.contractorUploadCorrectedFile(nc.id, file);
    obs$.pipe(takeUntil(this.destroy$), finalize(() => { this.uploadingId = null; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Corrected file uploaded.');
        this.load();
      },
      error: (err) => this.toast.error(err?.error?.message || 'Upload failed'),
    });
  }

  trackById(_: number, row: VendorNcRow): string {
    return row.id;
  }

  formatDate(value: string | null): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
