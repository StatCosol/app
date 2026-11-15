import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CcoEscalation, CcoEscalationsApi } from '../../../core/api/cco-escalations.api';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-cco-escalations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cco-escalations.component.html',
  styleUrls: ['../../../shared/escalations/escalations.component.scss'],
})
export class CcoEscalationsComponent implements OnInit, OnDestroy {
  items: CcoEscalation[] = [];
  statusFilter = '';
  search = '';
  private appliedSearch = '';
  page = 1;
  readonly limit = 25;
  total = 0;
  loaded = false;
  loading = false;
  loadError = '';
  actionError = '';
  private read?: Subscription;
  private writes = new Subscription();
  private saving = new Set<string>();
  private uncertain = new Set<string>();
  private confirming = new Set<string>();
  private version = 0;
  private destroyed = false;

  constructor(
    private api: CcoEscalationsApi,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.version++;
    this.read?.unsubscribe();
    this.writes.unsubscribe();
  }
  applyFilters(): void {
    this.appliedSearch = this.search.trim();
    this.page = 1;
    this.load();
  }
  load(): void {
    if (this.destroyed) return;
    this.read?.unsubscribe();
    this.version++;
    this.items = [];
    this.total = 0;
    this.loaded = false;
    this.loading = true;
    this.loadError = '';
    this.actionError = '';
    this.cdr.markForCheck();
    this.read = this.api.list({ page: this.page, limit: this.limit, status: this.statusFilter, q: this.appliedSearch }).subscribe({
      next: result => {
        // Closing the last item on a later page may shrink the result set.
        const lastPage = Math.max(1, Math.ceil(result.total / this.limit));
        if (this.page > lastPage) { this.page = lastPage; this.load(); return; }
        this.items = result.items;
        this.total = result.total;
        this.items.forEach(row => this.uncertain.delete(row.id));
        this.loading = false;
        this.loaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Escalations could not be loaded. Retry before relying on the list or counts.';
        this.cdr.markForCheck();
      },
    });
  }
  get pageCount(): number { return Math.max(1, Math.ceil(this.total / this.limit)); }
  get openCount(): number { return this.items.filter(row => row.status === 'OPEN').length; }
  get ackCount(): number { return this.items.filter(row => row.status === 'ACK').length; }
  get closedCount(): number { return this.items.filter(row => row.status === 'CLOSED').length; }
  changePage(page: number): void {
    if (this.loading || !this.loaded || page < 1 || page > this.pageCount || page === this.page) return;
    this.page = page;
    this.load();
  }
  isSaving(id: string): boolean { return this.saving.has(id); }
  isUncertain(id: string): boolean { return this.uncertain.has(id); }
  canAct(row: CcoEscalation, status: 'ACK' | 'CLOSED'): boolean {
    return !this.destroyed && this.loaded && !this.loading && !this.loadError
      && this.items.includes(row) && !!row.id && !!row.clientId
      && ['OPEN', 'ACK'].includes(row.status) && row.status !== status
      && !this.saving.has(row.id) && !this.uncertain.has(row.id) && !this.confirming.has(row.id);
  }
  async closeEscalation(row: CcoEscalation): Promise<void> {
    if (!this.canAct(row, 'CLOSED')) return;
    const version = this.version;
    this.confirming.add(row.id);
    this.cdr.markForCheck();
    try {
      const ok = await this.dialog.confirm('Close escalation', 'Confirm the issue is resolved before closing this escalation.', { confirmText: 'Close escalation' });
      this.confirming.delete(row.id);
      if (ok && version === this.version) this.updateStatus(row, 'CLOSED');
    } finally {
      this.confirming.delete(row.id);
      if (!this.destroyed) this.cdr.markForCheck();
    }
  }
  updateStatus(row: CcoEscalation, status: 'ACK' | 'CLOSED'): void {
    if (!['ACK', 'CLOSED'].includes(status) || !this.canAct(row, status)) return;
    this.saving.add(row.id);
    this.actionError = '';
    this.cdr.markForCheck();
    this.writes.add(this.api.updateStatus(row, status).subscribe({
      next: () => { this.saving.delete(row.id); this.load(); },
      error: () => {
        this.saving.delete(row.id);
        this.uncertain.add(row.id);
        // A pending read may predate the uncertain update and cannot confirm it.
        if (this.loading) {
          this.read?.unsubscribe();
          this.version++;
          this.loading = false;
          this.loadError = 'Refresh escalations to confirm the latest statuses.';
        }
        this.actionError = 'The status change could not be confirmed. Refresh before retrying.';
        this.cdr.markForCheck();
      },
    }));
  }
}
