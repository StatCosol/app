import { IconComponent } from '../ui/icon/icon.component';
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
  imports: [IconComponent, CommonModule, FormsModule],
  template: `
    @if (visible) {
      <section class="attendance" aria-label="Contractor attendance approval">
        <div class="attendance-heading">
          <h2>Attendance approval</h2>
          <div class="attendance-heading-actions">
            @if (isContractor) {
              <button type="button" (click)="downloadTemplate()" [disabled]="busy()" class="compact-action" title="Download attendance template" aria-label="Download attendance template" data-action-label="Download attendance template" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
            }
            <button type="button" (click)="load()" [disabled]="busy()" class="compact-action" title="Refresh attendance" aria-label="Refresh attendance" data-action-label="Refresh attendance" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /></button>
          </div>
        </div>
        <p>Contractor submits attendance → Assigned branch reviews → Payroll is calculated.</p>
        <p>
          Sundays worked are paid double unless you mark them as C-off. C-off is valid for 90 days;
          unused C-off is paid as double wages when it expires. C-off days taken are paid days.
        </p>
        <p>
          Device attendance counts distinct days with accepted punches. Review incomplete shifts and
          leave before approval.
        </p>
        @if (isContractor) {
          <p>Upload attendance Excel from Monthly Documents, or submit device attendance below.</p>

          <div class="field-action-group">
          <label class="action-field"
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
          <div class="attached-actions">
            <button type="button" (click)="submitSystem()" [disabled]="busy() || !branchId" class="compact-action" title="Submit device attendance for {{ periodMonth }}" aria-label="Submit device attendance for {{ periodMonth }}" attr.data-action-label="Submit device attendance for {{ periodMonth }}" data-action-icon="send"><ui-icon name="send" [size]="20" /><span class="compact-action-label">
            Submit device attendance for {{ periodMonth }}
          </span></button>
          </div>
          </div>
        }

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
                    <th>Sundays worked</th>
                    <th>Sundays as C-off</th>
                    <th>C-off taken</th>
                    <th>C-off balance</th>
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
                      <td>
                        @if (batch.canReview) {
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.5"
                            [attr.aria-label]="'Sundays worked for ' + row.employee_code"
                            [(ngModel)]="row.sunday_days_worked"
                          />
                        } @else {
                          {{ row.sunday_days_worked || 0 }}
                        }
                      </td>
                      <td>
                        @if (batch.canReview) {
                          <input
                            type="number"
                            min="0"
                            [max]="row.sunday_days_worked || 0"
                            step="0.5"
                            [attr.aria-label]="'Sundays as C-off for ' + row.employee_code"
                            [(ngModel)]="row.sunday_coff_days"
                          />
                        } @else {
                          {{ row.sunday_coff_days || 0 }}
                        }
                      </td>
                      <td>
                        @if (batch.canReview) {
                          <input
                            type="number"
                            min="0"
                            max="31"
                            step="0.5"
                            [attr.aria-label]="'C-off days taken for ' + row.employee_code"
                            [(ngModel)]="row.coff_days_availed"
                          />
                        } @else {
                          {{ row.coff_days_availed || 0 }}
                        }
                      </td>
                      <td>{{ row.coff_balance || 0 }}</td>
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
               class="compact-action" title="Approve and calculate payroll" aria-label="Approve and calculate payroll" data-action-label="Approve and calculate payroll" data-action-icon="check-circle"><ui-icon name="check-circle" [size]="20" /></button>
              <button
                type="button"
                (click)="review(batch.id, 'return')"
                [disabled]="busy() || (notes[batch.id] || '').trim().length < 5"
               class="compact-action" title="Return for correction" aria-label="Return for correction" data-action-label="Return for correction" data-action-icon="undo"><ui-icon name="undo" [size]="20" /></button>
            }
          </article>
        } @empty {
          @if (!busy()) {
            <p>No attendance batches for this period.</p>
          }
        }
        @if (hasMore()) {
          <button type="button" (click)="load(true)" [disabled]="busy()" class="compact-action" title="Load more attendance" aria-label="Load more attendance" data-action-label="Load more attendance" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /></button>
        }
      </section>
    }
  `,
  styles: [
    `
      .attendance-heading, .attendance-heading-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .attendance-heading { justify-content: space-between; }
      .attached-actions button, .attendance-heading-actions button { margin: 0; }
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
                  sunday_days_worked: r.sunday_days_worked || 0,
                  sunday_coff_days: r.sunday_coff_days || 0,
                  coff_days_availed: r.coff_days_availed || 0,
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
