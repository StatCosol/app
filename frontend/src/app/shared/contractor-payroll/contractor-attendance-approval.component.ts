import { downloadBlob } from '../utils/download-blob';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-contractor-attendance-approval',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (visible) {
      <section class="attendance" aria-label="Contractor attendance approval">
        <h2>Attendance approval</h2>
        <p>Contractor submits attendance → Assigned branch reviews → Payroll is calculated.</p>
        <p>
          Device attendance counts distinct days with accepted punches. Review incomplete shifts and
          leave before approval.
        </p>
        @if (isContractor) {
          <p>Upload attendance Excel from Monthly Documents, or submit device attendance below.</p>
          <button type="button" (click)="downloadTemplate()" [disabled]="busy()">
            Download attendance template
          </button>
          <label
            >Deployment branch
            <select [(ngModel)]="branchId">
              <option value="">Select branch</option>
              @for (branch of branches(); track branch.id) {
                <option [value]="branch.id">
                  {{ branch.branchName || branch.branchname || branch.name }}
                </option>
              }
            </select>
          </label>
          <button type="button" (click)="submitSystem()" [disabled]="busy() || !branchId">
            Submit device attendance for {{ periodMonth }}
          </button>
        }
        <button type="button" (click)="load()" [disabled]="busy()">Refresh attendance</button>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        @if (busy()) {
          <p role="status">Loading…</p>
        }
        @for (batch of batches(); track batch.id) {
          <article>
            <h3>{{ batch.branch_name }} · {{ batch.contractor_name }}</h3>
            <p>{{ batch.period_month }} · {{ batch.source }} · {{ batch.status }}</p>
            @if (batch.remarks) {
              <p>Branch remarks: {{ batch.remarks }}</p>
            }
            <details>
              <summary>Review {{ batch.rows_snapshot.length }} attendance rows</summary>
              <table>
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Employee</th>
                    <th>Payable days</th>
                    <th>Overtime hours</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of batch.rows_snapshot; track row.employee_code) {
                    <tr>
                      <td>{{ row.employee_code }}</td>
                      <td>{{ row.employee_name }}</td>
                      <td>
                        @if (batch.canReview) {
                          <input
                            type="number"
                            min="0"
                            max="31"
                            step="0.5"
                            [attr.aria-label]="'Payable days for ' + row.employee_code"
                            [(ngModel)]="row.days_worked"
                          />
                        } @else {
                          {{ row.days_worked }}
                        }
                      </td>
                      <td>
                        @if (batch.canReview) {
                          <input
                            type="number"
                            min="0"
                            max="744"
                            step="0.5"
                            [attr.aria-label]="'Overtime hours for ' + row.employee_code"
                            [(ngModel)]="row.ot_hours"
                          />
                        } @else {
                          {{ row.ot_hours || 0 }}
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
            @if (batch.canReview) {
              <label
                >Review remarks <textarea [(ngModel)]="notes[batch.id]" maxlength="2000"></textarea>
              </label>
              <button
                type="button"
                (click)="review(batch.id, 'approve')"
                [disabled]="busy() || (notes[batch.id] || '').trim().length < 5"
              >
                Approve and calculate payroll
              </button>
              <button
                type="button"
                (click)="review(batch.id, 'return')"
                [disabled]="busy() || (notes[batch.id] || '').trim().length < 5"
              >
                Return for correction
              </button>
            }
          </article>
        } @empty {
          @if (!busy()) {
            <p>No attendance batches for this period.</p>
          }
        }
        @if (hasMore()) {
          <button type="button" (click)="load(true)" [disabled]="busy()">
            Load more attendance
          </button>
        }
      </section>
    }
  `,
  styles: [
    `
      .attendance {
        padding: 20px;
        margin: 18px 0;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: white;
      }
      article {
        padding: 16px 0;
        border-top: 1px solid #ddd;
      }
      label {
        display: block;
        margin: 12px 0;
      }
      button {
        margin: 8px;
        padding: 8px;
        border: 1px solid #94a3b8;
        border-radius: 6px;
      }
      td,
      th {
        padding: 8px;
        text-align: left;
      }
      textarea {
        display: block;
        width: 100%;
        min-height: 60px;
      }
      details {
        overflow: auto;
      }
    `,
  ],
})
export class ContractorAttendanceApprovalComponent implements OnChanges, OnDestroy {
  @Input() clientId = '';
  @Input() periodMonth = '';
  private request?: Subscription;
  private branchRequest?: Subscription;
  readonly batches = signal<any[]>([]);
  readonly branches = signal<any[]>([]);
  readonly hasMore = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  notes: Record<string, string> = {};
  branchId = '';
  readonly isContractor: boolean;
  readonly visible: boolean;
  constructor(
    private http: HttpClient,
    auth: AuthService,
  ) {
    const user = auth.getUser();
    this.isContractor = user?.roleCode === 'CONTRACTOR';
    this.visible =
      this.isContractor ||
      user?.roleCode === 'BRANCH_DESK' ||
      (user?.roleCode === 'CLIENT' && user?.userType === 'BRANCH');
    if (this.isContractor)
      this.branchRequest = this.http.get<any>('/api/v1/contractor/branches').subscribe({
        next: (data) => this.branches.set(Array.isArray(data) ? data : data.data || []),
        error: () =>
          this.error.set('Could not load deployment branches. Refresh this page to retry.'),
      });
  }
  ngOnChanges() {
    this.load();
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
    this.branchRequest?.unsubscribe();
  }
  load(append = false) {
    this.request?.unsubscribe();
    if (!this.visible) return;
    this.busy.set(true);
    this.error.set('');
    if (!append) {
      this.batches.set([]);
      this.notes = {};
      this.hasMore.set(false);
    }
    this.request = this.http
      .get<any>('/api/v1/contractor-attendance', {
        params: {
          clientId: this.clientId,
          periodMonth: this.periodMonth,
          offset: this.batches().length,
        },
      })
      .subscribe({
        next: (data) => {
          this.batches.set(append ? [...this.batches(), ...data.data] : data.data);
          this.hasMore.set(!!data.hasMore);
          this.busy.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Could not load attendance');
          this.busy.set(false);
        },
      });
  }
  review(id: string, decision: string) {
    this.busy.set(true);
    this.error.set('');
    this.request = this.http
      .post('/api/v1/contractor-attendance/' + id + '/review', {
        decision,
        remarks: this.notes[id],
        ...(decision === 'approve'
          ? {
              rows: this.batches()
                .find((b) => b.id === id)
                ?.rows_snapshot.map((r: any) => ({
                  employee_code: r.employee_code,
                  days_worked: r.days_worked,
                  ot_hours: r.ot_hours || 0,
                })),
            }
          : {}),
      })
      .subscribe({
        next: () => this.load(),
        error: (err) => {
          this.error.set(err.error?.message || 'Attendance review failed');
          this.busy.set(false);
        },
      });
  }
  downloadTemplate() {
    this.request = this.http
      .get('/api/v1/contractor/computation/attendance/template', { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          void downloadBlob(blob, 'contractor-attendance-template.xlsx').catch(() =>
            this.error.set('Download failed'),
          );
        },
        error: () => this.error.set('Could not download attendance template'),
      });
  }
  submitSystem() {
    this.busy.set(true);
    this.error.set('');
    this.request = this.http
      .post('/api/v1/contractor/computation/attendance/system', {
        branchId: this.branchId,
        periodMonth: this.periodMonth,
      })
      .subscribe({
        next: () => this.load(),
        error: (err) => {
          this.error.set(err.error?.message || 'Device attendance submission failed');
          this.busy.set(false);
        },
      });
  }
}
