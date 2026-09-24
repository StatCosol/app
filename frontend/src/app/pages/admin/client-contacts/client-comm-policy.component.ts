import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth.service';
import { environment } from '../../../../environments/environment';
interface Policy { commType: string; requestDay: number; deadlineDay: number; enabled: boolean; version: number; }
@Component({
  selector: 'app-client-comm-policy', standalone: true, imports: [FormsModule],
  template: `<section class="bg-white border rounded-xl p-4 space-y-3" aria-label="Client reminder schedule">
    <h2 class="font-semibold">Monthly reminder schedule</h2>
    <p class="text-sm text-gray-600">Requests cover the previous month. Days are in Indian time. These dates control request emails; they do not change statutory or payroll deadlines. No past requests are sent when settings change.</p>
    @if (message()) { <p role="status">{{ message() }}</p> }
    @for (p of policies(); track p.commType) {
      <fieldset class="border rounded-lg p-3 flex flex-wrap gap-3 items-end" [disabled]="busy() || !canEdit">
        <legend>{{ p.commType === 'MCD_REQUEST' ? 'Contractor documents' : 'Payroll inputs' }}</legend>
        <label><input type="checkbox" [(ngModel)]="p.enabled" /> Enabled</label>
        <label>Request day <input class="w-20 border rounded p-1" type="number" min="1" max="28" [(ngModel)]="p.requestDay" /></label>
        <label>Requested by day <input class="w-20 border rounded p-1" type="number" [min]="p.requestDay" max="28" [(ngModel)]="p.deadlineDay" /></label>
        @if (canEdit) { <button type="button" class="border rounded px-3 py-1" (click)="save(p)">Save schedule</button> }
      </fieldset>
    }
  </section>`,
})
export class ClientCommPolicyComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) clientId = '';
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private request?: Subscription;
  policies = signal<Policy[]>([]);
  busy = signal(false);
  message = signal('');
  get canEdit() { return this.auth.getUser()?.roleCode === 'ADMIN'; }
  private get url() { return `${environment.apiBaseUrl}/api/v1/admin/client-contacts/client/${this.clientId}/policies`; }
  ngOnChanges() {
    this.request?.unsubscribe(); this.policies.set([]); this.message.set('');
    if (!this.clientId) return;
    this.busy.set(true);
    this.request = this.http.get<Policy[]>(this.url).subscribe({
      next: rows => { this.policies.set(rows); this.busy.set(false); },
      error: () => { this.message.set('Schedules could not be loaded. Select the client again to retry.'); this.busy.set(false); },
    });
  }
  ngOnDestroy() { this.request?.unsubscribe(); }
  save(p: Policy) {
    if (this.busy() || !this.canEdit) return;
    if (![p.requestDay, p.deadlineDay].every(n => Number.isInteger(n) && n >= 1 && n <= 28) || p.deadlineDay < p.requestDay) {
      this.message.set('Use days 1–28, with the deadline on or after the request day.'); return;
    }
    this.busy.set(true); this.message.set('');
    this.request = this.http.patch<Policy[]>(this.url, { ...p }).subscribe({
      next: rows => { this.policies.set(rows); this.busy.set(false); this.message.set('Schedule saved for future requests.'); },
      error: err => { this.busy.set(false); this.message.set(err?.status === 409 ? 'Another user changed these settings. Select the client again to refresh.' : 'Schedule could not be saved.'); },
    });
  }
}
