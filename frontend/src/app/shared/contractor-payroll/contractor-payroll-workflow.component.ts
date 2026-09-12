import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-contractor-payroll-workflow',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="workflow" aria-label="Contractor payroll approvals">
      <h2>Payroll approval and verification</h2>
      <p>
        Contractor submits → CRM approves → Auditor verifies and locks. Returned payroll must be
        corrected; reopening requires Admin or CCO and a reason.
      </p>
      <button type="button" (click)="load()" [disabled]="busy()">Refresh approvals</button>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (busy()) {
        <p role="status">Loading…</p>
      }
      @for (item of versions(); track item.id) {
        <article>
          <strong
            >{{ item.periodMonth }} · Version {{ item.version }} ·
            {{ item.status.replaceAll('_', ' ') }}</strong
          >
          <p>{{ item.branchName }} · {{ item.contractorName }}</p>
          <p>
            {{ item.employeeCount }} employees · Gross {{ item.grossWage | number: '1.2-2' }} · Net
            {{ item.netSalary | number: '1.2-2' }} · {{ item.exceptions }} exceptions
          </p>
          @if (item.allowedActions.length) {
            <label
              >Review reason / evidence reference
              <textarea
                [(ngModel)]="notes[item.id]"
                maxlength="2000"
                placeholder="Explain the decision. For verification, reference attendance, rates, payments and statutory evidence."
              ></textarea>
            </label>
            @for (action of item.allowedActions; track action) {
              <button
                type="button"
                (click)="act(item, action)"
                [disabled]="busy() || (notes[item.id] || '').trim().length < 10"
              >
                {{ label(action) }}
              </button>
            }
          }
          @if (item.canDownload) {
            <button type="button" (click)="download(item)" [disabled]="busy()">
              Download approved working pack
            </button>
          }
          <button type="button" (click)="showHistory(item)" [disabled]="busy()">
            Review history
          </button>
        </article>
      } @empty {
        @if (!busy() && !error()) {
          <p>
            No payroll versions are available in this view. Existing attendance calculations must be
            regenerated and submitted for approval.
          </p>
        }
      }
      @if (hasMore()) {
        <button type="button" (click)="load(true)" [disabled]="busy()">
          Load more payroll versions
        </button>
      }
      @if (history().length) {
        <h3>Review history</h3>
        @for (event of history(); track $index) {
          <p>
            {{ event.createdAt | date: 'medium' }} · Version {{ event.version }} ·
            {{ event.actorRole }} · {{ event.action }}: {{ event.reason }}
          </p>
        }
      }
      <small
        >The working pack contains payroll, attendance and PF/ESI/PT/LWF calculations. Payment
        proofs and statutory filing receipts remain separate evidence.</small
      >
    </section>
  `,
  styles: [
    `
      .workflow {
        background: #fff;
        border: 1px solid #cbd5e1;
        padding: 20px;
        border-radius: 12px;
        margin: 18px 0;
      }
      h2 {
        font-size: 20px;
        margin: 0 0 8px;
      }
      p {
        margin: 8px 0;
        overflow-wrap: anywhere;
      }
      article {
        padding: 16px 0;
        border-top: 1px solid #e2e8f0;
        margin-top: 12px;
      }
      label,
      textarea {
        display: block;
        width: 100%;
      }
      textarea {
        border: 1px solid #94a3b8;
        border-radius: 6px;
        padding: 8px;
        min-height: 70px;
      }
      button {
        padding: 8px 12px;
        border: 1px solid #94a3b8;
        border-radius: 6px;
        margin: 8px 8px 0 0;
      }
      button:disabled {
        opacity: 0.5;
      }
      [role='alert'] {
        color: #b91c1c;
      }
      small {
        display: block;
        margin-top: 12px;
        color: #475569;
      }
    `,
  ],
})
export class ContractorPayrollWorkflowComponent implements OnChanges, OnDestroy {
  @Input() clientId = '';
  @Input() periodMonth = '';
  @Input() branchId = '';
  versions = signal<any[]>([]);
  history = signal<any[]>([]);
  busy = signal(false);
  hasMore = signal(false);
  error = signal('');
  notes: Record<string, string> = {};
  private request?: Subscription;
  private readonly base = '/api/v1/contractor-payroll/versions';
  constructor(private readonly http: HttpClient) {}
  ngOnChanges(): void {
    this.notes = {};
    this.load();
  }
  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }
  load(append = false): void {
    this.request?.unsubscribe();
    if (!append) {
      this.versions.set([]);
      this.history.set([]);
      this.hasMore.set(false);
    }
    this.error.set('');
    this.busy.set(true);
    const params: Record<string, string> = { offset: String(append ? this.versions().length : 0) };
    if (this.clientId) params['clientId'] = this.clientId;
    if (this.periodMonth) params['periodMonth'] = this.periodMonth;
    if (this.branchId) params['branchId'] = this.branchId;
    this.request = this.http.get<any>(this.base, { params }).subscribe({
      next: (res) => {
        this.versions.set(append ? [...this.versions(), ...(res.data || [])] : res.data || []);
        this.hasMore.set(!!res.hasMore);
        this.busy.set(false);
      },
      error: (err) => this.fail(err),
    });
  }
  label(action: string): string {
    return (
      (
        {
          submit: 'Submit to CRM',
          approve: 'Approve payroll',
          verify: 'Verify and lock',
          return: 'Return for correction',
          reopen: 'Authorize reopening',
        } as Record<string, string>
      )[action] || action
    );
  }
  act(item: any, action: string): void {
    this.request?.unsubscribe();
    this.busy.set(true);
    this.error.set('');
    this.request = this.http
      .post(`${this.base}/${item.id}/actions/${action}`, { reason: this.notes[item.id] })
      .subscribe({
        next: () => this.load(),
        error: (err) => this.fail(err),
      });
  }
  showHistory(item: any): void {
    this.request?.unsubscribe();
    this.busy.set(true);
    this.error.set('');
    this.request = this.http.get<any[]>(`${this.base}/${item.id}/history`).subscribe({
      next: (events) => {
        this.history.set(events);
        this.busy.set(false);
      },
      error: (err) => this.fail(err),
    });
  }
  download(item: any): void {
    this.request?.unsubscribe();
    this.busy.set(true);
    this.error.set('');
    this.request = this.http
      .get(`${this.base}/${item.id}/pack`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `contractor-payroll-${item.periodMonth}-v${item.version}.xlsx`;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.busy.set(false);
        },
        error: (err) => this.fail(err),
      });
  }
  private fail(err: any): void {
    this.error.set(
      err?.error?.message || 'Could not complete the payroll request. Refresh and try again.',
    );
    this.busy.set(false);
  }
}
