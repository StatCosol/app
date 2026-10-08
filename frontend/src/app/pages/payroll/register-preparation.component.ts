import { IconComponent } from '../../shared/ui/icon/icon.component';
import { RegisterEvidenceComponent } from './register-evidence.component';
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
  ViewChild,
  ElementRef,
  Injector,
  afterNextRender,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, TimeoutError, timeout } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface RegisterGeneratedScope {
  branchId: string;
  year: number;
  month: number;
}

interface Field {
  key: string;
  label: string;
  type: string;
  required: boolean;
}
@Component({
  selector: 'app-register-preparation',
  standalone: true,
  imports: [IconComponent, FormsModule, RegisterEvidenceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .register-record-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 640px) { .register-record-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1024px) { .register-record-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `],
  template: `
    <section class="border p-4 my-4 bg-gray-50">
      <h4 class="font-semibold text-lg">3. Prepare and review details</h4>
      <p class="text-sm mt-2">{{ annual ? 'Calendar year ' + year : 'Period: ' + month + '/' + year }} · {{ rows.length }} {{ rows.length === 1 ? 'record' : 'records' }}</p>
      <p class="text-sm my-2">
        Use the branch and period selected above. Fields marked * are required. Prepared files need
        review and authentication before use.
      </p>
      @if (error && (!generationAttempted || !eligible)) {
        <p role="alert" class="text-red-700 whitespace-pre-line">{{ error }}</p>
      }
      @if (eligibilityReason) {
        <p role="status" class="text-amber-800 text-sm my-2">{{ eligibilityReason }}</p>
      }
      @if (notice && !generationAttempted) {
        <p role="status" class="text-sm my-2">{{ notice }}</p>
      }
      @if (!branchId || !year || !periodMonth) {
        <p>Select a branch, month and year above.</p>
      }
      @if (annual) {
        <p class="text-sm my-2">
          Annual calendar-year register (January–December). The selected year applies; the monthly
          filter is ignored. Enter reviewed full-year worked days and leave balances with an HR
          ledger reference.
        </p>
      }
      @if (fields.length) {
        @if (eligible) { <h5 class="font-semibold mt-4 mb-2">Data source and company role</h5> }
        @if (eligible && supportsContractor) {
          <details class="border rounded bg-white p-3 my-3" [open]="recordSource === 'CONTRACTOR'">
            <summary class="cursor-pointer text-sm">Workers: <strong>{{ workerSourceLabel }}</strong> · Change worker source</summary>
            <p class="text-sm my-2">Use your company’s employees for staff on your payroll, including staff deployed to customers. Choose an assigned contractor only for that contractor’s workers.</p>
          <label class="block text-sm my-2"
            >Whose workers should be loaded?
            <select
              class="block border rounded p-2 w-full mt-1"
              [(ngModel)]="recordSource"
              (ngModelChange)="changeSource()"
            >
              <option value="EMPLOYEES">Your company’s employees</option>
              <option value="CONTRACTOR">An assigned contractor’s workers</option>
            </select>
          </label>
          @if (recordSource === 'CONTRACTOR') {
            <label class="block text-sm my-2"
              >Assigned contractor
              <select
                class="block border rounded p-2 w-full mt-1"
                [(ngModel)]="contractorId"
                (ngModelChange)="changeContractor()"
              >
                <option value="">Select contractor</option>
                @for (c of contractors; track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </label>
          }
          </details>
        }
        @if (eligible && capacityRequired) {
          <label class="block text-sm my-3"
            >Your company’s responsibility at this site *
            <select class="block border rounded p-2 w-full" [(ngModel)]="actingCapacity">
              <option value="">Select the work relationship</option>
              <option value="DIRECT_EMPLOYER">Direct employer at this site</option>
              <option value="PRINCIPAL_EMPLOYER">Principal employer engaging contractors</option>
              <option value="CONTRACTOR">Our company is a contractor to another company</option>
            </select>
          </label>
          <p class="text-sm">
            Choose the responsibility held by your company at this site. If your company supplies its own employees as a contractor, choose the contractor role; the worker source remains Your company’s employees.
          </p>
        }
        <label class="block text-sm my-2"
          >Supporting record reference
          {{ isEvent || isMaternity || manualOnly ? '*' : '(optional)' }}
          <input
            class="border rounded p-2 block w-full"
            [(ngModel)]="meta['supportingReference']"
            placeholder="Incident report, source document or ledger reference"
          />
        </label>
        <div class="flex flex-wrap gap-3 my-3">
          <button type="button" class="compact-action underline" (click)="blank()" [disabled]="busy" title="Download empty template (no worker data)" aria-label="Download empty template (no worker data)" data-action-label="Download empty template (no worker data)" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
          @if (canPrefill) {
            <button
              type="button"
              class="compact-action underline"
              (click)="prefill()"
              [disabled]="
                busy || (draftPrefill && draftLoaded) ||
                (recordSource === 'EMPLOYEES' && requiresPayroll && !runId) ||
                (recordSource === 'CONTRACTOR' && !contractorId) ||
                !eligible
              "
             title="Load selected contractor records" aria-label="Load selected contractor records" data-action-label="Load selected contractor records" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /><span class="compact-action-label">
              {{
                draftPrefill && draftLoaded ? 'Saved records loaded' : recordSource === 'CONTRACTOR'
                  ? 'Load selected contractor records'
                  : prefillLabel
              }}
            </span></button>
          }
        </div>
        @if (eligible) {
          @if (draftPrefill) {
            @if (!runId && recordSource === 'EMPLOYEES') {
              <p role="status" class="text-amber-800 my-2">Select an approved payroll run for this branch and month to load the worker details.</p>
            }
            @if (busy) { <p role="status">Preparing register details…</p> }
            @if (missingDetails.length) {
              <details class="border p-3 my-3">
                <summary>Review remaining required details</summary>
                <ul class="list-disc pl-5">
                  @for (detail of missingDetails; track $index) { <li>{{ detail }}</li> }
                </ul>
              </details>
            }
          }
          @if ((reuseAvailable || operational) && (recordSource === 'EMPLOYEES' || contractorId)) {
            <app-register-evidence
              [formId]="formId"
              [branchId]="branchId"
              [year]="year || 0"
              [month]="periodMonth || 0"
              [contractorId]="recordSource === 'CONTRACTOR' ? contractorId : ''"
              [reuseAvailable]="reuseAvailable"
              [reuseBasis]="reuseBasis"
              [leaveCalculationAvailable]="leaveCalculationAvailable"
              [operational]="operational"
              [isEvent]="isEvent"
              [draftMetadata]="meta"
              [draftRows]="rows"
              (sourceSelected)="useSource($event)"
            ></app-register-evidence>
          }
          <h5 class="font-semibold mt-5 mb-3">Employer and issue details</h5>
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
          @if (particularFields.length) {
            <h5 class="font-semibold my-3">{{ particularsTitle }}</h5>
            <p class="text-sm">
              Complete these details for this register. Retain the establishment details and every register sheet together.
            </p>
            @for (group of particularGroups; track group.title) {
              <details class="border rounded bg-white p-3 my-3" [open]="particularGroups.length === 1">
                <summary class="cursor-pointer font-medium">{{ group.title }}
                  <span class="font-normal text-sm ml-2">{{ missingFields(group.fields, particulars) }} required fields remaining</span>
                </summary>
            <div class="grid sm:grid-cols-2 gap-3 my-3">
              @for (field of group.fields; track field.key) {
                <label class="text-sm"
                  >{{ field.label }}{{ field.required ? ' *' : '' }}
                  <textarea
                    class="block border rounded p-2 w-full"
                    [(ngModel)]="particulars[field.key]"
                    maxlength="2000"
                  ></textarea>
                </label>
              }
            </div>
              </details>
            }
          }
          @if (isMaternity) {
            <p class="text-sm my-3">
              Use authorised HR records for every woman employee, including those without a
              maternity event. Enter the selected month's employment dates and retain earlier
              records. Leave inapplicable event details blank. Payment dates and amounts must agree
              with supporting evidence.
            </p>
          }
          <h5 class="font-semibold mt-5 mb-2">{{ isEvent ? 'Event records' : 'Worker records' }}</h5>
          <p class="text-sm mb-3">Open each record to review loaded values and complete missing details.</p>
          @for (row of rows; track $index; let i = $index) {
            <details class="border my-3 p-3" [open]="rows.length === 1">
              <summary class="cursor-pointer">
                Record {{ i + 1 }} — {{ row['name'] || row['employee_2'] || 'New record' }}
                <span class="text-sm ml-2">{{ missingFields(fields, row) }} required fields remaining</span>
              </summary>
              <div class="register-record-grid gap-3 my-3">
                @for (field of fields; track field.key) {
                  <label class="text-sm"
                    >{{ field.label }}{{ field.required ? ' *' : '' }}
                    <input
                      class="block border rounded p-2 w-full"
                      [type]="field.type === 'date' ? 'date' : 'text'"
                      [(ngModel)]="row[field.key]"
                      [readonly]="field.key === 'inspectorRemarks'"
                      [disabled]="busy"
                      maxlength="2000"
                    />
                  </label>
                }
              </div>
              <button type="button" class="compact-action underline" (click)="rows.splice(i, 1)" [disabled]="busy" title="Remove record" aria-label="Remove record" data-action-label="Remove record" data-action-icon="trash"><ui-icon name="trash" [size]="20" /></button>
            </details>
          }
          <h5 class="font-semibold mt-5">Review and generate</h5>
          <p class="text-sm my-2">Generation saves a file for Payroll review and downloads a copy. Branch Desk access follows approval.</p>
          <div #generationFeedback data-testid="register-generation-feedback" aria-label="Register generation result" tabindex="-1" class="scroll-mt-24" [attr.aria-busy]="generating">
            @if (generationAttempted && error) {
              <p role="alert" class="border border-red-300 bg-red-50 rounded p-3 my-3 text-red-800 whitespace-pre-line max-h-72 overflow-y-auto">{{ error }}</p>
            }
            @if (busy && !generating) {
              <p role="status" class="my-3">Loading source records. Please wait before generating.</p>
            }
            @if (!busy && !rows.length) {
              <p role="status" class="my-3">Add at least one record before generating.</p>
            }
            @if (generating) {
              <p role="status" class="border rounded p-3 my-3">Generating and saving your register. Please wait…</p>
            }
            @if (generationAttempted && notice) {
              <p role="status" class="border border-emerald-300 bg-emerald-50 rounded p-3 my-3 text-emerald-900">{{ notice }}</p>
            }
          </div>
          <div class="flex flex-wrap gap-4 my-3">
            <button
              type="button"
              class="compact-action underline"
              (click)="rows.push({})"
              [disabled]="busy || rows.length >= 500"
             title="Add record" aria-label="Add record" data-action-label="Add record" data-action-icon="plus"><ui-icon name="plus" [size]="20" /></button>
            <button
              type="button"
              class="compact-action border rounded bg-blue-700 text-white px-4 py-2"
              (click)="generate()"
              [disabled]="busy || !rows.length"
             title="Generate and save register" aria-label="Generate and save register" data-action-label="Generate and save register" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /><span class="compact-action-label">
              {{ generating ? 'Generating and saving…' : 'Generate and save register' }}
            </span></button>
          </div>
        }
      }
    </section>
  `,
})
export class RegisterPreparationComponent implements OnChanges, OnDestroy {
  @Output() generated = new EventEmitter<RegisterGeneratedScope>();
  @Input() formId = '';
  @Input() branchId = '';
  @Input() runId = '';
  @Input() year: number | null = null;
  @Input() month: number | null = null;
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);
  @ViewChild('generationFeedback') private generationFeedback?: ElementRef<HTMLElement>;
  generationAttempted = false;
  generating = false;
  private readonly changed = new Subject<void>();
  private revision = 0;
  private readonly destroyed = new Subject<void>();
  private readonly base = environment.apiBaseUrl + '/api/v1/payroll/register-library';
  fields: Field[] = [];
  rows: Record<string, string | number>[] = [{}];
  meta: Record<string, string> = {};
  particulars: Record<string, string | number> = {};
  particularFields: Field[] = [];
  particularsTitle = '';
  manualOnly = false;
  capacityRequired = false;
  actingCapacity = '';
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
  eligibilityReason = '';
  recordSource = 'EMPLOYEES';
  contractorId = '';
  contractors: { id: string; name: string }[] = [];
  supportsContractor = false;
  isEvent = false;
  isMaternity = false;
  annual = false;
  get periodMonth() {
    return this.annual ? 12 : this.month;
  }
  operational = false;
  reuseAvailable = false;
  reuseBasis = '';
  leaveCalculationAvailable = false;
  draftPrefill = false;
  draftLoaded = false;
  canPrefill = false;
  requiresPayroll = true;
  prefillLabel = 'Prefill from approved payroll';

  ngOnChanges() {
    this.revision++;
    this.changed.next();
    this.fields = [];
    this.particularFields = [];
    this.particulars = {};
    this.particularsTitle = '';
    this.manualOnly = false;
    this.capacityRequired = false;
    this.actingCapacity = '';
    this.rows = [{}];
    this.meta = {};
    this.particulars = {};
    this.actingCapacity = '';
    this.error = '';
    this.notice = '';
    this.generationAttempted = false;
    this.generating = false;
    this.eligible = false;
    this.eligibilityReason = '';
    this.busy = false;
    this.canPrefill = false;
    this.draftPrefill = false;
    this.draftLoaded = false;
    this.recordSource = 'EMPLOYEES';
    this.contractorId = '';
    this.contractors = [];
    this.supportsContractor = false;
    this.isEvent = false;
    this.isMaternity = false;
    this.annual = false;
    this.operational = false;
    this.reuseAvailable = false;
    this.reuseBasis = '';
    this.leaveCalculationAvailable = false;
    if (!this.formId) return;
    this.http
      .get<any>(this.url('/definition'))
      .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
      .subscribe({
        next: (d) => {
          this.fields = d.layout.fields;
          this.particularFields = d.layout.particulars || [];
          this.particularsTitle = d.layout.particularsTitle || '';
          this.manualOnly = !!d.layout.manualOnly;
          this.capacityRequired = !!d.layout.capacityRequired;
          this.isEvent = d.layout.baseFormNumber === 'EVENT';
          this.isMaternity = d.layout.baseFormNumber === 'MATERNITY';
          this.annual = d.layout.periodKind === 'ANNUAL';
          this.operational = ['EVENT', 'LEAVE'].includes(d.layout.baseFormNumber);
          this.reuseAvailable = !!d.reuseRule;
          this.reuseBasis = d.reuseRule?.basis || '';
          this.leaveCalculationAvailable = d.leaveCalculationAvailable === true;
          this.draftPrefill = d.layout.payrollDraftPrefill === true;
          this.canPrefill = !this.isEvent && !this.isMaternity && (!d.layout.manualOnly || this.draftPrefill);
          this.supportsContractor =
            ['I', 'IV', 'V', 'IX'].includes(d.layout.baseFormNumber) ||
            (d.form?.sourceId === 'tsi' && d.layout.capacityRequired === true) ||
            d.form?.actCode === 'TS_SHOPS_1988';
          this.requiresPayroll = d.layout.payrollPrefill || this.draftPrefill;
          this.prefillLabel = this.requiresPayroll
            ? 'Prefill from approved payroll'
            : d.layout.baseFormNumber === 'I'
              ? 'Prefill approved employee records'
              : d.layout.baseFormNumber === 'LEAVE'
                ? 'Fill from approved earned-leave applications'
                : 'Prefill approved daily attendance';
          this.checkEligibility();
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
  }
  private checkEligibility() {
    if (this.branchId && this.year && this.periodMonth) {
      this.http
        .get<{ eligible: boolean; reason?: string }>(this.url('/eligibility'), { params: this.params() })
        .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
        .subscribe({
          next: (result) => {
            this.eligible = result.eligible === true;
            this.eligibilityReason = this.eligible
              ? ''
              : result.reason || 'This register is not available for the selected branch and period.';
            if (this.eligible && this.draftPrefill && this.runId) this.prefill();
            this.cdr.markForCheck();
          },
          error: (e) => this.fail(e),
        });
    }
  }
  useSource(input: any) {
    if (
      input.branchId !== this.branchId ||
      input.year !== this.year ||
      input.month !== this.periodMonth
    )
      return;
    this.rows = structuredClone(input.rows);
    this.particulars = structuredClone(input.particulars || {});
    this.actingCapacity = input.actingCapacity || '';
    this.meta = Object.fromEntries(
      Object.entries(input).filter(
        ([k]) =>
          ![
            'rows',
            'particulars',
            'actingCapacity',
            'branchId',
            'year',
            'month',
            'contractorUserId',
          ].includes(k),
      ),
    ) as Record<string, string>;
    this.cdr.markForCheck();
  }
  private url(suffix: string) {
    return this.base + '/' + encodeURIComponent(this.formId) + suffix;
  }
  private params() {
    return new HttpParams()
      .set('branchId', this.branchId)
      .set('year', String(this.year))
      .set('month', String(this.periodMonth));
  }
  get workerSourceLabel(): string {
    if (this.recordSource === 'EMPLOYEES') return 'Your company’s employees';
    return this.contractors.find(c => c.id === this.contractorId)?.name || 'Select an assigned contractor';
  }
  changeContractor() {
    this.draftLoaded = false;
    this.revision++;
    this.changed.next();
    this.rows = [{}];
    this.meta = {};
    this.particulars = {};
    this.actingCapacity = '';
    this.error = '';
    this.notice = '';
    this.generationAttempted = false;
    this.generating = false;
    this.busy = false;
    if (this.eligible && this.draftPrefill &&
        (this.recordSource === 'EMPLOYEES' ? !!this.runId : !!this.contractorId)) this.prefill();
  }
  changeSource() {
    this.contractorId = '';
    this.changeContractor();
    this.contractors = [];
    if (this.recordSource === 'CONTRACTOR') {
      this.busy = true;
      this.http
        .get<{ id: string; name: string }[]>(this.url('/contractors'), { params: this.params() })
        .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
        .subscribe({
          next: (rows) => {
            this.contractors = rows;
            this.busy = false;
            this.cdr.markForCheck();
          },
          error: (e) => this.fail(e),
        });
    }
  }
  prefill() {
    if (!this.eligible || this.busy || (this.draftPrefill && this.draftLoaded)) return;
    this.generationAttempted = false;
    this.notice = '';
    this.busy = true;
    this.error = '';
    this.http
      .get<any>(this.url('/prefill'), {
        params: this.params()
          .set('runId', this.runId)
          .set('contractorId', this.recordSource === 'CONTRACTOR' ? this.contractorId : ''),
      })
      .pipe(takeUntil(this.changed), takeUntil(this.destroyed))
      .subscribe({
        next: (d) => {
          this.rows = d.rows;
          for (const [key, value] of Object.entries(d.metadata || {})) {
            if (!String(this.meta[key] ?? '').trim()) this.meta[key] = String(value);
          }
          for (const [key, value] of Object.entries(d.particulars || {})) {
            if (!String(this.particulars[key] ?? '').trim()) this.particulars[key] = String(value);
          }
          if (d.sourceReference && !this.meta['supportingReference']) this.meta['supportingReference'] = d.sourceReference;
          this.draftLoaded = true;
          this.notice = d.notice;
          this.busy = false;
          this.cdr.markForCheck();
        },
        error: (e) => this.fail(e),
      });
  }
  missingFields(fields: Field[], values: Record<string, string | number>): number {
    return fields.filter(field => field.required && (values[field.key] == null || String(values[field.key]).trim() === '')).length;
  }
  get particularGroups(): { title: string; fields: Field[] }[] {
    const groups = new Map<string, Field[]>();
    for (const field of this.particularFields) {
      const key = field.key;
      const title = /^(category|class|headcount|adolescent)/.test(key) || ['regularWorkers', 'contractWorkers'].includes(key)
        ? 'Workforce totals'
        : ['cleaning', 'inspections', 'inspectors', 'accidents', 'injured', 'deceased'].includes(key)
          ? 'Inspections, safety and maintenance'
          : /Signatory|Signature|Designation$/.test(key) || key === 'managerAddress' || key === 'manager'
            ? 'Responsible persons and authentication'
            : ['wageOrder', 'registrations', 'principalEmployer', 'contractors'].includes(key)
              ? 'Registrations and work arrangements'
              : 'Establishment and contact details';
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title)!.push(field);
    }
    return [...groups].map(([title, fields]) => ({ title, fields }));
  }
  get missingDetails(): string[] {
    const missing = (value: unknown) => value == null || String(value).trim() === '';
    const result = this.metadataFields.filter(f => missing(this.meta[f.key])).map(f => f.label);
    if (this.manualOnly && missing(this.meta['supportingReference'])) result.push('Supporting record reference');
    if (this.capacityRequired && !this.actingCapacity) result.push('Company capacity at this site');
    result.push(...this.particularFields.filter(f => f.required && missing(this.particulars[f.key])).map(f => f.label));
    if (!this.rows.length) result.push('At least one worker record');
    for (const [index, row] of this.rows.entries()) {
      const fields = this.fields.filter(f => f.required && missing(row[f.key]));
      if (fields.length) result.push('Record ' + (index + 1) + ': ' + fields.map(f => f.label).join(', '));
    }
    return result;
  }
  blank() {
    if (this.busy) return;
    this.generationAttempted = false;
    this.fetchFile('/template');
  }
  generate() {
    if (this.busy) return;
    this.generationAttempted = true;
    this.error = '';
    this.notice = '';
    if (!this.eligible) {
      this.error = this.eligibilityReason || 'This register is not available for the selected branch and period.';
    } else if (this.recordSource === 'CONTRACTOR' && !this.contractorId) {
      this.error = 'Select the assigned contractor under Change worker source.';
    } else if (this.capacityRequired && !this.actingCapacity) {
      this.error = 'Select your company’s responsibility at this site before generating.';
    } else if (this.draftPrefill && this.missingDetails.length) {
      this.error = 'Complete the remaining required details before generation:\n' + this.missingDetails.join('\n');
    }
    if (this.error) {
      this.showGenerationFeedback();
      return;
    }
    this.fetchFile('/generate', {
      ...this.meta,
      branchId: this.branchId,
      year: this.year,
      month: this.periodMonth,
      rows: this.rows,
      ...(this.capacityRequired ? { actingCapacity: this.actingCapacity } : {}),
      ...(this.particularFields.length ? { particulars: this.particulars } : {}),
      contractorUserId: this.recordSource === 'CONTRACTOR' ? this.contractorId : undefined,
    });
  }
  private showGenerationFeedback() {
    this.cdr.markForCheck();
    if (!this.generationAttempted) return;
    const revision = this.revision;
    afterNextRender(() => {
      if (revision !== this.revision || !this.generationAttempted) return;
      const feedback = this.generationFeedback?.nativeElement;
      feedback?.scrollIntoView({ block: 'nearest' });
      feedback?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
  private fetchFile(suffix: string, body?: unknown) {
    this.busy = true;
    this.generating = !!body;
    this.error = '';
    this.notice = '';
    this.showGenerationFeedback();
    const request = body
      ? this.http.post(this.url(suffix), body, { responseType: 'blob' })
      : this.http.get(this.url(suffix), { responseType: 'blob' });
    request.pipe(timeout(120000), takeUntil(this.changed), takeUntil(this.destroyed)).subscribe({
      next: (blob) => {
        this.busy = false;
        this.generating = false;
        try {
          const url = URL.createObjectURL(blob);
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = this.formId + (body ? '-' + this.year + (this.annual ? '' : '-' + this.periodMonth) : '-blank') + '.xlsx';
            a.click();
          } finally {
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
          this.notice = body
            ? 'Register saved for review. Download started. If it does not appear, use the saved registers below to download the file.'
            : 'Blank format download started.';
        } catch {
          if (body) {
            this.notice = 'Register saved for review, but the download could not start. Use the saved registers below to download the file.';
          } else {
            this.error = 'The template download could not start. Please try again.';
          }
        }
        if (body && this.year && this.periodMonth)
          this.generated.emit({ branchId: this.branchId, year: this.year, month: this.periodMonth });
        this.showGenerationFeedback();
      },
      error: (e) => this.fail(e),
    });
  }
  private async fail(e: any) {
    const revision = this.revision;
    let detail = e?.error;
    if (detail instanceof Blob) {
      try {
        detail = JSON.parse(await detail.text());
      } catch {
        detail = null;
      }
    }
    if (revision !== this.revision) return;
    this.busy = false;
    this.generating = false;
    this.error = e instanceof TimeoutError
      ? (this.generationAttempted
        ? 'The request timed out. Check saved registers before trying again; saving may have completed on the server.'
        : 'The download request timed out. Please try again.')
      : e?.status === 0 && this.generationAttempted
        ? 'The connection was interrupted. Check saved registers before trying again; saving may have completed on the server.'
      : Array.isArray(detail?.errors)
      ? detail.errors.join('\n')
      : Array.isArray(detail?.message)
        ? detail.message.join('\n')
      : typeof detail?.message === 'string'
        ? detail.message
        : 'Could not prepare this register. Please retry.';
    this.showGenerationFeedback();
  }
  ngOnDestroy() {
    this.revision++;
    this.destroyed.next();
    this.destroyed.complete();
    this.changed.complete();
  }
}
