import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegistrationDetail, RenewalOption, RegistrationRequestsApi, RegistrationTicket, RequestScope, ReviewAction } from './registration-requests.api';

@Component({
  selector: 'app-registration-requests', standalone: true,
  imports: [CommonModule, FormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './registration-requests.component.html', styleUrl: './registration-requests.component.scss',
})
export class RegistrationRequestsComponent implements OnChanges, OnDestroy {
  @Input() branchId = '';
  @Input() clientId = '';
  @Input() reviewer = false;
  @Output() changed = new EventEmitter<void>();
  expanded = false;
  scope: RequestScope = 'ACTUAL';
  rows: RegistrationTicket[] = [];
  selected: RegistrationDetail | null = null;
  loading = false;
  detailLoading = false;
  busy = false;
  error = '';
  detailError = '';
  notice = '';
  remarks = '';
  showCreate = false;
  createAction: 'APPLY' | 'RENEW' = 'APPLY';
  renewalId = '';
  renewalOptions: RenewalOption[] = [];
  renewalLoading = false;
  renewalError = '';
  private renewalVersion = 0;
  draft = { registrationType: '', authority: '', notes: '' };
  private savedDrafts: Partial<Record<'APPLY' | 'RENEW', typeof this.draft>> = {};
  private version = 0;
  private detailVersion = 0;
  private destroyed = false;
  private destroy$ = new Subject<void>();
  constructor(private injector: Injector, private cdr: ChangeDetectorRef) {}
  private get api() { return this.injector.get(RegistrationRequestsApi); }
  get openCount() { return this.rows.filter(r => ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT'].includes(r.status)).length; }
  ngOnChanges() { this.scope = 'ACTUAL'; this.resetContext(); }
  ngOnDestroy() { this.destroyed = true; this.version++; this.detailVersion++; this.destroy$.next(); this.destroy$.complete(); }
  toggle() { this.expanded = !this.expanded; if (this.expanded) this.resetContext(); }
  changeScope() { this.resetContext(); }
  private resetContext() {
    this.savedDrafts = {};
    this.renewalVersion++; this.renewalOptions = []; this.renewalId = ''; this.renewalLoading = false; this.renewalError = ''; this.createAction = 'APPLY';
    this.version++; this.detailVersion++; this.rows = []; this.selected = null;
    this.remarks = ''; this.error = ''; this.detailError = ''; this.notice = '';
    this.showCreate = false; this.draft = { registrationType: '', authority: '', notes: '' };
    this.loading = false; this.detailLoading = false;
    if (this.expanded && this.branchId) this.load();
  }
  load() {
    if (!this.branchId || this.busy) return;
    const version = ++this.version;
    if (this.detailLoading) { this.detailVersion++; this.detailLoading = false; this.selected = null; }
    this.loading = true; this.error = ''; this.cdr.markForCheck();
    this.api.list(this.branchId, this.scope, this.clientId).pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        if (version !== this.version) return;
        this.rows = rows; this.loading = false;
        if (this.selected) {
          const current = rows.find(r => r.id === this.selected!.ticket.id);
          if (!current) { this.selected = null; this.detailVersion++; }
          else this.select(current, true);
        }
        this.cdr.markForCheck();
      },
      error: () => { if (version !== this.version) return; this.rows = []; this.loading = false; this.error = 'Request history is unavailable. Retry before relying on counts.'; this.cdr.markForCheck(); },
    });
  }
  select(row: RegistrationTicket, preserveDraft = false) {
    if (this.busy) return;
    const version = ++this.detailVersion, context = this.version;
    this.selected = null; this.detailError = ''; this.detailLoading = true;
    if (!preserveDraft) { this.remarks = ''; this.notice = ''; }
    this.cdr.markForCheck();
    this.api.detail(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: detail => {
        if (version !== this.detailVersion || context !== this.version) return;
        this.detailLoading = false;
        if (detail.ticket.branchId !== this.branchId || detail.ticket.isTest !== (this.scope === 'TEST')) {
          this.detailError = 'Request scope changed. Refresh the list.';
        } else this.selected = detail;
        this.cdr.markForCheck();
      },
      error: () => { if (version !== this.detailVersion || context !== this.version) return; this.detailLoading = false; this.detailError = 'Request details could not be loaded. Select the request to retry.'; this.cdr.markForCheck(); },
    });
  }
  can(action: ReviewAction) {
    const status = this.selected?.ticket.status;
    if (!status || this.busy || this.loading || this.detailLoading || this.error || this.detailError) return false;
    if (action === 'RESUBMIT') return !this.reviewer && status === 'AWAITING_CLIENT';
    if (!this.reviewer) return false;
    return action === 'REVIEW' ? status === 'OPEN' : action === 'CORRECTION' ? ['OPEN', 'IN_PROGRESS'].includes(status) : status === 'IN_PROGRESS';
  }
  act(action: ReviewAction) {
    if (!this.can(action) || !this.remarks.trim() || !this.selected) return;
    const ticket = this.selected.ticket, context = this.version;
    const remarks = this.remarks;
    this.busy = true; this.notice = ''; this.cdr.markForCheck();
    this.api.action(ticket, this.scope, action, remarks).pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.busy = false;
        if (context !== this.version) { if (!this.destroyed && this.expanded) this.load(); return; }
        this.rows = this.rows.map(row => row.id === saved.id ? saved : row);
        this.remarks = ''; this.changed.emit(); this.select(saved);
        this.notice = 'Request updated. History and report are refreshed.';
        this.cdr.markForCheck();
      },
      error: err => {
        this.busy = false;
        if (context !== this.version) { if (!this.destroyed && this.expanded) this.load(); return; }
        this.notice = err?.error?.message || 'Could not save. Your remarks are preserved; refresh the request before retrying.';
        this.cdr.markForCheck();
      },
    });
  }
  openCreate(action: 'APPLY' | 'RENEW') {
    if (this.busy || this.loading || this.reviewer) return;
    this.showCreate = !(this.showCreate && this.createAction === action);
    if (this.createAction !== action) {
      this.renewalVersion++; this.renewalLoading = false;
      this.savedDrafts[this.createAction] = { ...this.draft };
      this.draft = this.savedDrafts[action] || { registrationType: '', authority: '', notes: '' };
    }
    this.createAction = action;
    if (this.showCreate && action === 'RENEW') this.loadRenewalOptions();
  }
  loadRenewalOptions() {
    const version = ++this.renewalVersion, branch = this.branchId, scope = this.scope;
    this.renewalLoading = true; this.renewalError = ''; this.cdr.markForCheck();
    this.api.renewalOptions(branch, scope).pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        if (version !== this.renewalVersion || branch !== this.branchId || scope !== this.scope) return;
        this.renewalOptions = rows; this.renewalLoading = false;
        if (!rows.some(r => r.id === this.renewalId)) this.chooseRenewal('');
        this.cdr.markForCheck();
      },
      error: () => {
        if (version !== this.renewalVersion || branch !== this.branchId || scope !== this.scope) return;
        this.renewalOptions = []; this.renewalLoading = false;
        this.renewalError = 'Registrations could not be loaded. Retry before submitting a renewal.';
        this.cdr.markForCheck();
      },
    });
  }
  chooseRenewal(id: string) {
    this.renewalId = id;
    const row = this.renewalOptions.find(r => r.id === id);
    this.draft.registrationType = row?.type || '';
    this.draft.authority = row?.authority || '';
  }
  get renewalReady() {
    return this.createAction !== 'RENEW' || (!this.renewalLoading && !this.renewalError && this.renewalOptions.some(r => r.id === this.renewalId));
  }
  create() {
    if (this.busy || this.loading || this.reviewer || !this.branchId || !this.renewalReady || !Object.values(this.draft).every(v => v.trim())) return;
    const context = this.version;
    this.busy = true; this.notice = ''; this.cdr.markForCheck();
    this.api.create({ branchId: this.branchId, recordScope: this.scope, ...this.draft, action: this.createAction, ...(this.createAction === 'RENEW' ? { registrationId: this.renewalId } : {}) }).pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.busy = false;
        if (context !== this.version) { if (!this.destroyed && this.expanded) this.load(); return; }
        this.rows = [saved, ...this.rows]; this.showCreate = false;
        delete this.savedDrafts[this.createAction];
        if (this.createAction === 'RENEW') this.renewalId = '';
        this.draft = { registrationType: '', authority: '', notes: '' };
        this.changed.emit(); this.select(saved); this.cdr.markForCheck();
      },
      error: err => { this.busy = false; if (context !== this.version) { if (!this.destroyed && this.expanded) this.load(); return; } this.notice = err?.error?.message || 'Submission failed. Your draft is preserved.'; this.cdr.markForCheck(); },
    });
  }
  label(status: string) { return ({ OPEN: 'Submitted', IN_PROGRESS: 'Under CRM review', AWAITING_CLIENT: 'Correction required', RESOLVED: 'Resolved', CLOSED: 'Closed' } as Record<string, string>)[status] || status; }
  title(ticket: RegistrationTicket) { return ticket.description.match(/(?:^|\r?\n)Registration Type: *([^\r\n]+)/i)?.[1] || ticket.subCategory; }
  exportReport() {
    if (!this.selected || this.busy || this.loading || this.detailLoading || this.error || this.detailError) return;
    const { ticket, messages } = this.selected;
    const rows = [
      ['Registration request review report', ticket.isTest ? 'TEST ONLY — NOT AN ACTUAL REGISTRATION' : 'ACTUAL REQUEST'],
      ['Request type', ticket.subCategory], ['Request ID', ticket.id], ['Branch ID', ticket.branchId], ['Status', this.label(ticket.status)],
      ['Purpose', 'CRM request approval is not proof of statutory licence issuance.'],
      ['Submitted', ticket.createdAt], ['Original request', ticket.description],
      ['Date', 'Role', 'Name', 'Review / correction remarks'],
      ...messages.map(m => [m.createdAt, m.senderRole || '', m.senderName || '', m.message]),
    ];
    const cell = (value: string) => { const text = String(value ?? ''); return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"'; };
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `registration-request-${ticket.isTest ? 'TEST' : 'ACTUAL'}-${ticket.id}.csv`; link.click(); URL.revokeObjectURL(url);
  }
}
