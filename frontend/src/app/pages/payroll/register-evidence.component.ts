import { RegisterLeaveCalculatorComponent } from './register-leave-calculator.component';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-register-evidence',
  standalone: true,
  imports: [FormsModule, RegisterLeaveCalculatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="border rounded bg-white p-3 my-3">
    @if (error) {
      <p role="alert" class="text-red-700 whitespace-pre-line">{{ error }}</p>
    }
    @if (notice) {
      <p role="status">{{ notice }}</p>
    }
    @if (reuseAvailable) {
      <h5 class="font-semibold">Reuse an approved Wages register</h5>
      <p class="text-sm my-2">
        {{ reuseBasis }} permits reviewed use of the corresponding Wages register. Confirm the same
        workforce and period. Reuse keeps the original file and requires payroll/admin approval.
      </p>
      <button class="underline" type="button" (click)="load()" [disabled]="busy">
        Find approved records
      </button>
      @if (loaded) {
        @if (!candidates.length) {
          <p class="text-sm my-2">
            No eligible approved record with verified workforce scope was found. Older records
            without scope evidence must be prepared and reviewed again.
          </p>
        }
        @if (candidates.length) {
          <label class="block text-sm my-2"
            >Approved source<select class="border rounded p-2 block w-full" [(ngModel)]="sourceId">
              <option value="">Select a source</option>
              @for (c of candidates; track c.id) {
                <option [value]="c.id">{{ c.title }} — {{ c.approvedAt }}</option>
              }
            </select></label
          >
          <label class="block text-sm my-2"
            >Reason this source satisfies the requirement<textarea
              class="border rounded p-2 block w-full"
              [(ngModel)]="attestation"
              maxlength="2000"
            ></textarea>
          </label>
          <button
            type="button"
            class="border rounded p-2"
            (click)="requestReuse()"
            [disabled]="busy || !sourceId || attestation.trim().length < 10"
          >
            Submit reuse for approval
          </button>
        }
        @for (link of links; track link.id) {
          <div class="border-t py-2 text-sm">
            <p>{{ link.attestation }}</p>
            <p>
              {{
                link.effective
                  ? 'Approved reuse — original Wages record retained'
                  : link.approvedAt
                    ? 'Source approval is no longer valid'
                    : 'Awaiting reuse approval'
              }}
            </p>
            @if (canApprove && !link.approvedAt) {
              <button
                type="button"
                class="underline"
                (click)="approve('/reuse/' + link.id + '/approve')"
                [disabled]="busy"
              >
                Approve reuse
              </button>
            }
          </div>
        }
      }
    }
    @if (operational && !isEvent && leaveCalculationAvailable) {
      <app-register-leave-calculator
        [formId]="formId"
        [branchId]="branchId"
        [year]="year"
        [month]="month"
        [rows]="draftRows"
        (calculated)="useCalculatedRows($event)"
      ></app-register-leave-calculator>
    }
    @if (operational) {
      <h5 class="font-semibold">
        Reviewed {{ isEvent ? 'incident' : 'leave-ledger' }} source records
      </h5>
      <p class="text-sm my-2">
        Complete the register fields and use a stable supporting reference. Saving a correction
        creates a new revision for review; previous evidence is retained.
      </p>
      <div class="flex gap-3">
        <button type="button" class="underline" (click)="saveSource()" [disabled]="busy">
          Save current details for review</button
        ><button type="button" class="underline" (click)="load()" [disabled]="busy">
          Load source records
        </button>
      </div>
      @if (loaded && !records.length) {
        <p class="text-sm my-2">No saved sources for this branch, form and period.</p>
      }
      @for (record of records; track record.id) {
        <div class="border-t py-2 text-sm">
          <p>
            {{ record.reference }} · Revision {{ record.revision }} ·
            {{ record.approvedAt ? 'Approved' : 'Awaiting source review' }}
          </p>
          <div class="flex gap-3">
            <button type="button" class="underline" (click)="preview(record)" [disabled]="busy">
              {{ record.approvedAt ? 'Use approved details' : 'Review saved details' }}
            </button>
            @if (canApprove && !record.approvedAt) {
              <button
                type="button"
                class="underline"
                (click)="approve('/operational-sources/' + record.id + '/approve')"
                [disabled]="busy"
              >
                Approve source
              </button>
            }
          </div>
        </div>
      }
    }
  </section>`,
})
export class RegisterEvidenceComponent implements OnChanges, OnDestroy {
  @Input() formId = '';
  @Input() branchId = '';
  @Input() year = 0;
  @Input() month = 0;
  @Input() contractorId = '';
  @Input() reuseAvailable = false;
  @Input() reuseBasis = '';
  @Input() leaveCalculationAvailable = false;
  @Input() operational = false;
  @Input() isEvent = false;
  @Input() draftMetadata: Record<string, string> = {};
  @Input() draftRows: Record<string, unknown>[] = [];
  @Output() sourceSelected = new EventEmitter<any>();
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private changed = new Subject<void>();
  private destroyed = new Subject<void>();
  candidates: any[] = [];
  links: any[] = [];
  records: any[] = [];
  sourceId = '';
  attestation = '';
  canApprove = false;
  busy = false;
  loaded = false;
  error = '';
  notice = '';
  ngOnChanges(changes: SimpleChanges) {
    if (
      ['formId', 'branchId', 'year', 'month', 'contractorId', 'reuseAvailable', 'operational'].some(
        (k) => changes[k],
      )
    ) {
      this.changed.next();
      this.candidates = [];
      this.links = [];
      this.records = [];
      this.sourceId = '';
      this.attestation = '';
      this.canApprove = false;
      this.busy = false;
      this.loaded = false;
      this.error = '';
      this.notice = '';
    }
  }
  private url(suffix: string) {
    return (
      environment.apiBaseUrl +
      '/api/v1/payroll/register-library/' +
      encodeURIComponent(this.formId) +
      suffix
    );
  }
  load() {
    if (!this.branchId || !this.year || !this.month) return;
    this.busy = true;
    this.error = '';
    const params = new HttpParams()
      .set('branchId', this.branchId)
      .set('year', this.year)
      .set('month', this.month)
      .set('contractorId', this.contractorId);
    this.http
      .get<any>(this.url(this.operational ? '/operational-sources' : '/reuse'), { params })
      .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
      .subscribe({
        next: (d) => {
          this.records = d.records || [];
          this.candidates = d.candidates || [];
          this.links = d.links || [];
          this.canApprove = d.canApprove;
          this.loaded = true;
          this.busy = false;
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
  }
  private post(suffix: string, body: unknown) {
    this.busy = true;
    this.error = '';
    this.http
      .post(this.url(suffix), body)
      .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
      .subscribe({
        next: () => {
          this.busy = false;
          this.notice = 'Saved. The source and reuse approval statuses are shown below.';
          this.load();
        },
        error: (e) => this.fail(e),
      });
  }
  requestReuse() {
    this.post('/reuse', {
      branchId: this.branchId,
      year: this.year,
      month: this.month,
      contractorId: this.contractorId || undefined,
      sourceRegisterId: this.sourceId,
      attestation: this.attestation,
    });
  }
  approve(suffix: string) {
    this.post(suffix, {});
  }
  saveSource() {
    this.post('/operational-sources', {
      ...this.draftMetadata,
      branchId: this.branchId,
      year: this.year,
      month: this.month,
      rows: this.draftRows,
    });
  }
  useCalculatedRows(rows: Record<string, unknown>[]) {
    this.sourceSelected.emit({
      ...this.draftMetadata,
      branchId: this.branchId,
      year: this.year,
      month: this.month,
      rows,
    });
    this.notice =
      'Calculated balance and evidence applied. Verify remaining particulars, then save the source for review.';
  }
  preview(record: any) {
    this.sourceSelected.emit(record.input);
    this.notice = record.approvedAt
      ? 'Approved source details loaded. Any changes require a new source revision.'
      : 'Pending source details loaded for review.';
  }
  private fail(e: any) {
    this.busy = false;
    this.error = Array.isArray(e?.error?.errors)
      ? e.error.errors.join('\n')
      : e?.error?.message || 'Could not load or save register evidence.';
    this.cdr.markForCheck();
  }
  ngOnDestroy() {
    this.changed.next();
    this.changed.complete();
    this.destroyed.next();
    this.destroyed.complete();
  }
}
