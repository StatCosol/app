import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PayrollRunsService, PayrollRunSummary } from '../../../pages/payroll/payroll-runs.service';

@Component({
  selector: 'ui-payroll-run-selector',
  standalone: true,
  imports: [FormsModule],
  template: `
    <select
      id="ap-detect-run-id"
      name="detectRunId"
      aria-label="Payroll run (optional)"
      [disabled]="disabled || !clientId || loading"
      [ngModel]="value"
      (ngModelChange)="valueChange.emit($event)"
      class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
    >
      <option value="">{{ loading ? 'Loading runs…' : 'All payroll runs' }}</option>
      @for (run of runs; track run.id) {
        <option [value]="run.id">
          {{ run.title || 'Payroll' }} · {{ run.periodMonth }}/{{ run.periodYear }} ·
          {{ run.payrollCategory || 'REGULAR' }} · {{ run.status }}
        </option>
      }
    </select>
    @if (error) {
      <small
        >Payroll runs could not be loaded.
        <button type="button" (click)="load()">Retry</button></small
      >
    }
  `,
})
export class PayrollRunSelectorComponent implements OnChanges, OnDestroy {
  @Input() clientId = '';
  @Input() value = '';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();
  runs: PayrollRunSummary[] = [];
  loading = false;
  error = false;
  private loadedClient = '';
  private request?: Subscription;
  constructor(
    private readonly api: PayrollRunsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}
  ngOnChanges(): void {
    if (this.loadedClient !== this.clientId) this.load();
  }
  load(): void {
    this.request?.unsubscribe();
    this.loadedClient = this.clientId;
    this.runs = [];
    this.error = false;
    this.loading = !!this.clientId;
    if (!this.clientId) return;
    this.request = this.api.listRuns({ clientId: this.clientId }).subscribe({
      next: (rows) => {
        this.runs = rows;
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
  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }
}
