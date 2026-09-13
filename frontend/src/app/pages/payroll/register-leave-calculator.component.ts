import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
@Component({
  selector: 'app-register-leave-calculator',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <details class="border p-3 my-3">
    <summary class="font-semibold cursor-pointer">
      Calculate annual statutory leave balances
    </summary>
    <p class="text-sm my-2">
      Use verified annual totals. Worked days earn leave; layoff, maternity and annual-leave days
      count toward qualification only. Awarded leave must meet the statutory minimum and the
      reviewed rounding or more-beneficial policy. Exclude holidays from leave used.
    </p>
    @if (error) {
      <p role="alert" class="text-red-700">{{ error }}</p>
    }
    <label class="block my-2"
      >Worker record<select class="border p-2" [(ngModel)]="workerIndex" (ngModelChange)="reset()">
        @for (row of rows; track $index; let i = $index) {
          <option [ngValue]="i">
            {{ i + 1 }} — {{ row['name'] || row['employeeCode'] || 'New record' }}
          </option>
        }
      </select></label
    >
    <label class="block my-2"
      ><input
        type="checkbox"
        [(ngModel)]="ledger['standardSection32Confirmed']"
        (ngModelChange)="invalidate()"
      />
      I have checked that standard section 32 applies to this worker. Special-category leave schemes
      and exemptions require separate verification.</label
    >
    <div class="grid sm:grid-cols-2 gap-3">
      <label
        >Joining date<input
          type="date"
          class="border p-2 block w-full"
          [(ngModel)]="ledger['joiningDate']"
          (ngModelChange)="invalidate()"
      /></label>
      <label
        >Exit date, if left this year<input
          type="date"
          class="border p-2 block w-full"
          [(ngModel)]="ledger['exitDate']"
          (ngModelChange)="invalidate()"
      /></label>
      <label
        >Worker category<select
          class="border p-2 block w-full"
          [(ngModel)]="ledger['category']"
          (ngModelChange)="invalidate()"
        >
          <option value="">Select category</option>
          <option value="ADULT">Adult</option>
          <option value="ADOLESCENT">Adolescent</option>
          <option value="UNDERGROUND_MINE">Underground mine worker</option>
        </select></label
      >
      @for (f of fields; track f.key) {
        <label
          >{{ f.label
          }}<input
            type="number"
            min="0"
            step="0.01"
            class="border p-2 block w-full"
            [(ngModel)]="ledger[f.key]"
            (ngModelChange)="invalidate()"
        /></label>
      }
      <label
        >Attendance/ledger evidence reference<input
          class="border p-2 block w-full"
          [(ngModel)]="ledger['evidenceReference']"
          (ngModelChange)="invalidate()"
          maxlength="300"
      /></label>
    </div>
    <button
      type="button"
      class="underline my-3"
      (click)="calculate()"
      [disabled]="busy || !rows.length"
    >
      Calculate and validate balances
    </button>
    @if (result) {
      <p>
        Statutory earned minimum: {{ result.minimumEarnedFraction }} days. Awarded:
        {{ result.awardedDays }}. Carry forward: {{ result.carryForward }} (ordinary
        {{ result.carryOrdinary }}, refused {{ result.carryRefused }}). Remaining encashable
        entitlement: {{ result.encashableExcess }} days.
      </p>
      <p class="text-sm my-2">
        Actual leave payments still require payment evidence. This calculation does not post an ESS
        balance or issue payment.
      </p>
      <button type="button" class="border rounded p-2" (click)="apply()">
        Use balance and calculation evidence in this worker's register
      </button>
    }
  </details>`,
})
export class RegisterLeaveCalculatorComponent implements OnChanges, OnDestroy {
  @Input() formId = '';
  @Input() branchId = '';
  @Input() year = 0;
  @Input() month = 0;
  @Input() rows: Record<string, unknown>[] = [];
  @Output() calculated = new EventEmitter<Record<string, unknown>[]>();
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private changed = new Subject<void>();
  workerIndex = 0;
  ledger: Record<string, any> = {};
  result: any = null;
  busy = false;
  error = '';
  private appliedInputs: any;
  private worker: any;
  fields = [
    { key: 'workedDays', label: 'Actual worked days' },
    { key: 'layoffDays', label: 'Layoff days' },
    { key: 'maternityDays', label: 'Maternity leave days' },
    { key: 'annualLeaveDays', label: 'Annual leave days for qualification' },
    { key: 'awardedDays', label: 'Awarded annual leave (reviewed rounding/policy)' },
    { key: 'openingOrdinary', label: 'Opening ordinary leave' },
    { key: 'openingRefused', label: 'Opening refused leave' },
    { key: 'usedOrdinary', label: 'Ordinary leave used' },
    { key: 'usedRefused', label: 'Refused leave used' },
    { key: 'encashedOrdinary', label: 'Ordinary leave already encashed' },
    { key: 'encashedRefused', label: 'Refused leave already encashed' },
    { key: 'refusedThisYear', label: 'Current unused leave applied for but refused' },
  ];
  ngOnChanges() {
    this.workerIndex = 0;
    this.reset();
  }
  invalidate() {
    this.changed.next();
    this.result = null;
    this.busy = false;
    this.error = '';
  }
  reset() {
    this.changed.next();
    this.result = null;
    this.busy = false;
    this.error = '';
    this.ledger = { joiningDate: this.rows[this.workerIndex]?.['joiningDate'] || '', category: '' };
  }
  calculate() {
    const worker = this.rows[this.workerIndex];
    if (!worker) return;
    const ledger = {
      ...this.ledger,
      year: this.year,
      exitDate: this.ledger['exitDate'] || undefined,
    };
    this.busy = true;
    this.error = '';
    this.result = null;
    this.http
      .post<any>(
        environment.apiBaseUrl +
          '/api/v1/payroll/register-library/' +
          encodeURIComponent(this.formId) +
          '/leave-calculation',
        { branchId: this.branchId, year: this.year, month: this.month, ledger },
      )
      .pipe(takeUntil(this.changed))
      .subscribe({
        next: (d) => {
          this.busy = false;
          if (this.rows[this.workerIndex] === worker) {
            this.result = d;
            this.worker = worker;
            this.appliedInputs = structuredClone(ledger);
          }
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.busy = false;
          this.error =
            e?.error?.errors?.join('\n') ||
            e?.error?.message ||
            'Could not calculate the leave balance';
          this.cdr.markForCheck();
        },
      });
  }
  apply() {
    if (!this.result || this.rows[this.workerIndex] !== this.worker) return;
    const rows = structuredClone(this.rows);
    rows[this.workerIndex]['carryForward'] = this.result.carryForward;
    const calculation =
      'Section 32 annual calculation; ' +
      JSON.stringify({
        inputs: this.appliedInputs,
        minimum: this.result.minimumEarnedFraction,
        awarded: this.result.awardedDays,
        carryOrdinary: this.result.carryOrdinary,
        carryRefused: this.result.carryRefused,
        encashableExcess: this.result.encashableExcess,
      });
    const previous = String(rows[this.workerIndex]['remarks'] || '').trim();
    const remarks = [previous, calculation].filter(Boolean).join('\n');
    if (remarks.length > 2000) {
      this.error =
        'Existing remarks and calculation evidence exceed 2,000 characters. Save the existing evidence separately before applying this calculation.';
      return;
    }
    rows[this.workerIndex]['remarks'] = remarks;
    this.result = null;
    this.calculated.emit(rows);
  }
  ngOnDestroy() {
    this.changed.next();
    this.changed.complete();
  }
}
