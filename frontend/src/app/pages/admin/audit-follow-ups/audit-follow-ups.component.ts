import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

export interface AuditFollowUp {
  id: string;
  auditId: string;
  auditCode: string | null;
  event: string;
  status: string;
  attempts: number;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  nextAttemptAt: string;
  completedAt: string | null;
}

@Component({
  selector: 'app-audit-follow-ups',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  templateUrl: './audit-follow-ups.component.html',
  styleUrl: './audit-follow-ups.component.scss',
})
export class AuditFollowUpsComponent implements OnInit, OnDestroy {
  readonly base = `${environment.apiBaseUrl}/api/v1/admin/audit-follow-ups`;
  readonly states = ['PENDING', 'RETRY', 'FAILED', 'SUCCEEDED', 'SKIPPED'];
  readonly labels: Record<string, string> = {
    PENDING: 'Queued', RETRY: 'Retry scheduled', FAILED: 'Needs attention',
    SUCCEEDED: 'Completed', SKIPPED: 'No longer applicable',
    NC_ACCEPTED: 'Correction accepted', NC_REJECTED: 'Correction rejected', NC_REUPLOADED: 'Correction uploaded',
  };
  items = signal<AuditFollowUp[]>([]);
  total = signal(0);
  loading = signal(false);
  retrying = signal('');
  error = signal('');
  message = signal('');
  status = '';
  page = 1;
  readonly limit = 25;
  private listRequest?: Subscription;
  private retryRequest?: Subscription;

  constructor(private readonly http: HttpClient) {}
  ngOnInit() { this.load(); }
  ngOnDestroy() { this.listRequest?.unsubscribe(); this.retryRequest?.unsubscribe(); }

  load(reset = false) {
    if (reset) this.page = 1;
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.items.set([]);
    const params: Record<string, string> = { page: String(this.page), limit: String(this.limit) };
    if (this.status) params['status'] = this.status;
    this.listRequest = this.http.get<{ items: AuditFollowUp[]; total: number }>(this.base, { params }).subscribe({
      next: (result) => { this.items.set(result.items); this.total.set(result.total); this.loading.set(false); },
      error: () => { this.total.set(0); this.loading.set(false); this.error.set('Unable to load audit follow-ups. Please refresh.'); },
    });
  }

  changePage(delta: number) {
    if (this.loading() || this.retrying() || this.page + delta < 1 || (delta > 0 && this.page * this.limit >= this.total())) return;
    this.page += delta;
    this.load();
  }

  retry(job: AuditFollowUp) {
    if (this.retrying() || this.loading() || !['RETRY', 'FAILED'].includes(job.status)) return;
    this.retrying.set(job.id);
    this.message.set('');
    this.error.set('');
    this.retryRequest = this.http.post(this.base + '/' + job.id + '/retry', {}).subscribe({
      next: () => {
        this.retrying.set('');
        this.message.set('Retry queued.');
        this.load(true);
      },
      error: (error) => {
        this.retrying.set('');
        this.error.set(error.status === 409 ? 'The job has changed. Refresh before retrying.' : 'Unable to queue the retry. Refresh to check its status.');
      },
    });
  }
}
