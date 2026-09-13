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
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface Field {
  key: string;
  label: string;
  type: string;
  required: boolean;
}
@Component({
  selector: 'app-register-preparation',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border p-4 my-4 bg-gray-50">
      <h4 class="font-semibold">Prepare selected register</h4>
      <p class="text-sm my-2">
        Use the branch and period selected above. Fields marked * are required. Prepared files need
        review and authentication before use.
      </p>
      @if (error) {
        <p role="alert" class="text-red-700 whitespace-pre-line">{{ error }}</p>
      }
      @if (notice) {
        <p role="status" class="text-sm my-2">{{ notice }}</p>
      }
      @if (!branchId || !year || !month) {
        <p>Select a branch, month and year above.</p>
      }
      @if (fields.length) {
        <div class="flex gap-3 my-3">
          <button type="button" class="underline" (click)="blank()" [disabled]="busy">
            Download blank format
          </button>
          @if (canPrefill) {
            <button
              type="button"
              class="underline"
              (click)="prefill()"
              [disabled]="busy || (requiresPayroll && !runId) || !eligible"
            >
              {{ prefillLabel }}
            </button>
          }
        </div>
        @if (eligible) {
          <div class="grid sm:grid-cols-2 gap-3">
            @for (item of metadataFields; track item.key) {
              <label class="text-sm"
                >{{ item.label }} *<input
                  class="block border rounded p-2 w-full"
                  [type]="item.key === 'issueDate' ? 'date' : 'text'"
                  [(ngModel)]="meta[item.key]"
                  maxlength="300"
              /></label>
            }
          </div>
          @for (row of rows; track $index; let i = $index) {
            <details class="border my-3 p-3" [open]="rows.length === 1">
              <summary class="cursor-pointer">
                Record {{ i + 1 }} — {{ row['name'] || row['employee_2'] || 'New record' }}
              </summary>
              <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 my-3">
                @for (field of fields; track field.key) {
                  <label class="text-sm"
                    >{{ field.label }}{{ field.required ? ' *' : '' }}
                    <input
                      class="block border rounded p-2 w-full"
                      [type]="field.type === 'date' ? 'date' : 'text'"
                      [(ngModel)]="row[field.key]"
                      maxlength="2000"
                    />
                  </label>
                }
              </div>
              <button type="button" class="underline" (click)="rows.splice(i, 1)" [disabled]="busy">
                Remove record
              </button>
            </details>
          }
          <div class="flex gap-4 my-3">
            <button
              type="button"
              class="underline"
              (click)="rows.push({})"
              [disabled]="busy || rows.length >= 500"
            >
              Add record
            </button>
            <button
              type="button"
              class="border rounded bg-blue-700 text-white px-4 py-2"
              (click)="generate()"
              [disabled]="busy || !rows.length"
            >
              Generate Excel register
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class RegisterPreparationComponent implements OnChanges, OnDestroy {
  @Output() generated = new EventEmitter<void>();
  @Input() formId = '';
  @Input() branchId = '';
  @Input() runId = '';
  @Input() year: number | null = null;
  @Input() month: number | null = null;
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly changed = new Subject<void>();
  private revision = 0;
  private readonly destroyed = new Subject<void>();
  private readonly base = environment.apiBaseUrl + '/api/v1/payroll/register-library';
  fields: Field[] = [];
  rows: Record<string, string | number>[] = [{}];
  meta: Record<string, string> = {};
  metadataFields = [
    { key: 'employer', label: 'Employer name' },
    { key: 'owner', label: 'Owner name' },
    { key: 'employerPan', label: 'Employer PAN/TAN' },
    { key: 'registrationNumber', label: 'Establishment registration / LIN' },
    { key: 'issueDate', label: 'Date of issue' },
  ];
  error = '';
  notice = '';
  busy = false;
  eligible = false;
  canPrefill = false;
  requiresPayroll = true;
  prefillLabel = 'Prefill from approved payroll';

  ngOnChanges() {
    this.revision++;
    this.changed.next();
    this.fields = [];
    this.rows = [{}];
    this.meta = {};
    this.error = '';
    this.notice = '';
    this.eligible = false;
    this.busy = false;
    this.canPrefill = false;
    if (!this.formId) return;
    this.http
      .get<any>(this.url('/definition'))
      .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
      .subscribe({
        next: (d) => {
          this.fields = d.layout.fields;
          this.canPrefill = true;
          this.requiresPayroll = d.layout.payrollPrefill;
          this.prefillLabel = d.layout.payrollPrefill ? 'Prefill from approved payroll' : d.layout.baseFormNumber === 'I' ? 'Prefill approved employee records' : 'Prefill approved daily attendance';
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
    if (this.branchId && this.year && this.month) {
      this.http
        .get<any>(this.url('/eligibility'), { params: this.params() })
        .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
        .subscribe({
          next: () => {
            this.eligible = true;
            this.cdr.markForCheck();
          },
          error: (e) => this.fail(e),
        });
    }
  }
  private url(suffix: string) {
    return this.base + '/' + encodeURIComponent(this.formId) + suffix;
  }
  private params() {
    return new HttpParams()
      .set('branchId', this.branchId)
      .set('year', String(this.year))
      .set('month', String(this.month));
  }
  prefill() {
    this.busy = true;
    this.error = '';
    this.http
      .get<any>(this.url('/prefill'), { params: this.params().set('runId', this.runId) })
      .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
      .subscribe({
        next: (d) => {
          this.rows = d.rows;
          this.notice = d.notice;
          this.busy = false;
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
  }
  blank() {
    this.fetchFile('/template');
  }
  generate() {
    this.fetchFile('/generate', {
      ...this.meta,
      branchId: this.branchId,
      year: this.year,
      month: this.month,
      rows: this.rows,
    });
  }
  private fetchFile(suffix: string, body?: unknown) {
    this.busy = true;
    this.error = '';
    const request = body
      ? this.http.post(this.url(suffix), body, { responseType: 'blob' })
      : this.http.get(this.url(suffix), { responseType: 'blob' });
    request.pipe(takeUntil(this.changed), takeUntil(this.destroyed)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = this.formId + (body ? '-' + this.year + '-' + this.month : '-blank') + '.xlsx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.busy = false;
        this.notice = body
          ? 'Register saved for review and downloaded.'
          : 'Blank format downloaded.';
        if (body) this.generated.emit();
        this.cdr.markForCheck();
      },
      error: (e) => this.fail(e),
    });
  }
  private async fail(e: any) {
    const revision = this.revision;
    this.busy = false;
    let detail = e?.error;
    if (detail instanceof Blob) {
      try {
        detail = JSON.parse(await detail.text());
      } catch {
        detail = null;
      }
    }
    if (revision !== this.revision) return;
    this.error = Array.isArray(detail?.errors)
      ? detail.errors.join('\n')
      : typeof detail?.message === 'string'
        ? detail.message
        : 'Could not prepare this register. Please retry.';
    this.cdr.markForCheck();
  }
  ngOnDestroy() {
    this.revision++;
    this.destroyed.next();
    this.destroyed.complete();
    this.changed.complete();
  }
}
