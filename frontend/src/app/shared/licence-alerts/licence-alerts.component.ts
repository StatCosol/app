import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LicenceWarnings {
  date: string;
  renewals: Array<{
    registrationId: string;
    branchName: string;
    type: string;
    registrationNumber: string | null;
    renewalDueDate: string;
    expiryDate: string;
    daysToRenewal: number;
    status: string;
  }>;
  manpower: Array<{
    registrationId: string;
    branchName: string;
    registrationNumber: string | null;
    licensedWorkerLimit: number | null;
    onRoll: number;
    contractor: number;
    total: number;
    excess: number | null;
    status: string;
  }>;
}

@Component({
  selector: 'app-licence-alerts',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="licence-panel" aria-labelledby="licence-warnings-heading">
    <div class="licence-heading">
      <div>
        <h2 id="licence-warnings-heading">Licence &amp; deployment warnings</h2>
        <p>Renew licences 30 days before expiry. Today's deployment counts each worker once.</p>
      </div>
      <button type="button" (click)="load()" [disabled]="loading">Refresh</button>
    </div>
    @if (error) {
      <p role="alert">Warnings could not be loaded. Please refresh to try again.</p>
    } @else if (data) {
      @if (data.manpower.length) {
        <h3>Factory manpower · {{ data.date | date: 'dd MMM yyyy' }}</h3>
        <div class="licence-cards">
          @for (row of data.manpower; track row.registrationId) {
            <article
              [class.breached]="row.status === 'BREACHED'"
              [class.unknown]="row.status === 'UNCONFIGURED'"
            >
              <strong>{{ row.branchName }}</strong
              ><span class="licence-number">{{ row.registrationNumber || 'Factory licence' }}</span>
              <p class="headcount">
                {{ row.total }} <span>/ {{ row.licensedWorkerLimit ?? 'limit not recorded' }}</span>
              </p>
              <p>{{ row.onRoll }} on-roll + {{ row.contractor }} contractor</p>
              @if (row.status === 'BREACHED') {
                <p class="warning" role="status">
                  Exceeds the licence limit by {{ row.excess }} {{ row.excess === 1 ? 'worker' : 'workers' }}
                </p>
              } @else if (row.status === 'UNCONFIGURED') {
                <p class="warning">Ask your CRM to record the licensed worker limit.</p>
              } @else {
                <p>
                  {{
                    row.status === 'AT_LIMIT'
                      ? 'At the licensed limit'
                      : 'Within the licensed limit'
                  }}
                </p>
              }
            </article>
          }
        </div>
      }
      @if (data.renewals.length) {
        <h3>Renewals needing attention</h3>
        <div class="licence-cards">
          @for (row of data.renewals; track row.registrationId) {
            <article
              [class.breached]="row.daysToRenewal < 0"
              [class.unknown]="row.daysToRenewal >= 0"
            >
              <strong>{{ row.branchName }} · {{ row.type }}</strong
              ><span class="licence-number">{{ row.registrationNumber }}</span>
              <p>
                <b>Renew by {{ row.renewalDueDate | date: 'dd MMM yyyy' }}</b>
              </p>
              <p>Expires {{ row.expiryDate | date: 'dd MMM yyyy' }}</p>
              @if (row.status === 'EXPIRED') {
                <p class="warning">Licence expired · renewal overdue</p>
              } @else if (row.daysToRenewal < 0) {
                <p class="warning">Renewal {{ -row.daysToRenewal }} days overdue</p>
              } @else {
                <p>
                  {{
                    row.daysToRenewal === 0
                      ? 'Renewal due today'
                      : 'Renewal due in ' + row.daysToRenewal + ' days'
                  }}
                </p>
              }
            </article>
          }
        </div>
      }
      @if (!data.manpower.length && !data.renewals.length) {
        <p>No renewal warnings or factory licence limits are recorded for the selected branches.</p>
      }
      <a [routerLink]="registrationRoute">Review registrations and licences</a>
    } @else if (loading) {
      <p>Loading licence warnings…</p>
    }
  </section>`,
  styles: [
    `
      .licence-panel {
        margin: 16px;
        padding: 20px;
        border: 1px solid #dbe3ed;
        border-radius: 16px;
        background: #fff;
        color: #17243a;
      }
      .licence-heading {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 16px;
        flex-wrap: wrap;
      }
      h2 {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }
      h3 {
        font-size: 15px;
        font-weight: 700;
        margin: 20px 0 10px;
      }
      p {
        font-size: 13px;
        margin: 7px 0;
        color: #475569;
      }
      button {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 7px 12px;
        background: #fff;
        font-size: 13px;
      }
      button:disabled {
        opacity: 0.5;
      }
      .licence-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
        gap: 12px;
      }
      article {
        border: 1px solid #a7d9cb;
        background: #f2fbf7;
        padding: 14px;
        border-radius: 12px;
      }
      .breached {
        border-color: #f1a9a9;
        background: #fff5f5;
      }
      .unknown {
        border-color: #e7c878;
        background: #fffaf0;
      }
      .licence-number {
        display: block;
        font-size: 12px;
        color: #64748b;
        margin-top: 4px;
      }
      .headcount {
        font-size: 28px;
        font-weight: 750;
        color: #17243a;
      }
      .headcount span {
        font-size: 14px;
        font-weight: 500;
      }
      .warning {
        font-weight: 650;
        color: #9a3412;
      }
      a {
        display: inline-block;
        margin-top: 16px;
        color: #13695b;
        text-decoration: underline;
        font-size: 13px;
      }
    `,
  ],
})
export class LicenceAlertsComponent implements OnChanges, OnDestroy {
  @Input() branchId: string | number | undefined;
  @Input() registrationRoute = '/client/compliance/registrations';
  loading = false;
  error = false;
  data: LicenceWarnings | null = null;
  private request?: Subscription;
  private readonly refresh: Subscription;
  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {
    this.refresh = this.zone.runOutsideAngular(() =>
      interval(60000).subscribe(() => this.zone.run(() => this.load())),
    );
  }
  ngOnChanges() {
    this.load();
  }
  load() {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = false;
    this.data = null;
    let params = new HttpParams();
    if (this.branchId && this.branchId !== 'ALL')
      params = params.set('branchId', String(this.branchId));
    this.request = this.http
      .get<LicenceWarnings>(environment.apiBaseUrl + '/api/v1/client/licence-alerts', { params })
      .subscribe({
        next: (data) => {
          this.data = data;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = true;
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
    this.refresh.unsubscribe();
  }
}
