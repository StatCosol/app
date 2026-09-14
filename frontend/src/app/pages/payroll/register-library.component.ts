import { RegisterPreparationComponent } from './register-preparation.component';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface LibraryForm {
  id: string;
  title: string;
  formNumber: string;
  ruleReference: string;
  actCode: string;
  rulesCode: string;
  kind: string;
  sourceStatus: string;
  notes: string;
  sourcePage: number | null;
  sourceDownloadAvailable: boolean;
  preparationAvailable: boolean;
  usage: string;
  source: {
    title: string;
    url: string;
    notification: string;
    publicationDate: string | null;
    corrigendumUrl?: string;
  };
}
interface Jurisdiction {
  code: string;
  name: string;
  note?: string;
  sourceUrl?: string | null;
}

@Component({
  selector: 'app-register-library',
  standalone: true,
  imports: [FormsModule, RegisterPreparationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details [open]="expanded" class="border rounded-lg p-4 mb-6 bg-white">
      <summary class="cursor-pointer text-lg font-semibold">
        Register formats by State, Act and Form
      </summary>
      <p class="text-sm text-gray-600 my-3">
        The selected branch supplies its state code. Employee, attendance and payroll records are
        restricted to that branch. Select the Act to see its register formats.
      </p>
      @if (branchName) {
        <p class="text-sm">
          Branch: <strong>{{ branchName }}</strong> · State code:
          <strong>{{ branchStateCode }}</strong>
        </p>
      }
      @if (!branchId) {
        <p class="text-sm my-3">Select a branch above to load its register formats.</p>
      }
      <div class="flex flex-wrap gap-3 my-3">
        <label
          >State / applicable rules
          <select
            aria-label="Register jurisdiction"
            [disabled]="loading || availableJurisdictions.length < 2"
            class="border rounded p-2 block"
            [(ngModel)]="jurisdiction"
            (ngModelChange)="load()"
          >
            @for (state of availableJurisdictions; track state.code) {
              <option [value]="state.code">{{ state.name }}</option>
            }
          </select>
        </label>
        <label
          >Act<select
            aria-label="Select Act for registers"
            class="border rounded p-2 block"
            [(ngModel)]="actCode"
            (ngModelChange)="changeAct()"
          >
            <option value="">Select an Act</option>
            @for (act of acts; track act.code) {
              <option [value]="act.code">{{ act.name }}</option>
            }
          </select></label
        >
        <button
          type="button"
          class="border rounded px-4 py-2 self-end bg-blue-700 text-white"
          (click)="submitAct()"
          [disabled]="loading || !actCode"
        >
          Show registers
        </button>
        <label
          >Find a register in the selected Act
          <input
            aria-label="Find an Act or form"
            class="border rounded p-2 block"
            [(ngModel)]="query"
            placeholder="For example: CLRA or XII"
          />
        </label>
      </div>
      @if (loading) {
        <p role="status">Loading formats…</p>
      }
      @if (error) {
        <p role="alert" class="text-red-700">{{ error }}</p>
        <button type="button" (click)="loadBranch()" class="underline">Retry</button>
      }
      @if (downloadError) {
        <p role="alert" class="text-red-700">{{ downloadError }}</p>
      }
      @if (info && !loading && !error) {
        <p class="text-sm mb-3">{{ info.note }}</p>
        <p class="text-sm text-amber-800 mb-3">
          Select the Act and choose Show registers to see only that Act’s formats and their usage.
          Preparation is enabled only for implemented formats and confirmed branch applicability.
          Other formats remain available as source references.
        </p>
        @for (form of visibleForms; track form.id) {
          <article class="border-t py-4">
            <h4 class="font-semibold">Form {{ form.formNumber }} — {{ form.title }}</h4>
            <p class="text-sm">{{ form.source.title }}</p>
            <p class="text-sm text-gray-600">
              {{ form.ruleReference }} · {{ form.source.notification }} ·
              {{
                form.sourceStatus === 'FINAL'
                  ? 'Final published source'
                  : form.sourceStatus === 'EXISTING_RULES'
                    ? 'Existing Act/rules source'
                    : 'Legacy source'
              }}
              · {{ kindLabel(form.kind) }}
            </p>
            <p class="text-sm my-2">{{ form.notes }} Usage: {{ form.usage }}</p>
            @if (form.preparationAvailable) {
              <button
                type="button"
                class="border rounded px-3 py-2 my-2"
                (click)="selectedForm = form"
              >
                Prepare this register
              </button>
            }
            @if (selectedForm?.id === form.id) {
              <app-register-preparation
                (generated)="generated.emit()"
                [formId]="form.id"
                [branchId]="branchId"
                [runId]="runId"
                [year]="year"
                [month]="month"
              ></app-register-preparation>
            }
            <div class="flex gap-4 text-sm">
              <a
                class="underline"
                [href]="sourceUrl(form)"
                target="_blank"
                rel="noopener noreferrer"
                >Open prescribed source{{
                  form.sourcePage ? ' (page ' + form.sourcePage + ')' : ''
                }}</a
              >
              @if (form.source.corrigendumUrl) {
                <a
                  class="underline"
                  [href]="form.source.corrigendumUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Open official correction</a
                >
              }
              @if (form.sourceDownloadAvailable) {
                <button
                  type="button"
                  class="underline"
                  [disabled]="downloading"
                  (click)="download(form)"
                >
                  Download source PDF
                </button>
              }
            </div>
          </article>
        } @empty {
          <p class="py-4">
            @if (!submittedActCode) {
              Select an Act and choose Show registers.
            } @else {
              No reviewed form matches this selection. A format from another Act or state will not
              be substituted.
            }
          </p>
        }
      }
    </details>
  `,
})
export class RegisterLibraryComponent implements OnInit, OnChanges, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyed = new Subject<void>();
  private readonly scopeChanged = new Subject<void>();
  private readonly base = environment.apiBaseUrl + '/api/v1/payroll/register-library';
  @Output() generated = new EventEmitter<void>();
  @Input() expanded = false;
  @Input() branchId = '';
  @Input() runId = '';
  @Input() year: number | null = null;
  @Input() month: number | null = null;
  actCode = '';
  submittedActCode = '';
  selectedForm: LibraryForm | null = null;
  jurisdictions: Jurisdiction[] = [];
  jurisdiction = '';
  branchStateCode = '';
  branchName = '';
  centralRulesAvailable = false;
  query = '';
  forms: LibraryForm[] = [];
  info: Jurisdiction | null = null;
  loading = false;
  downloading = false;
  error = '';
  downloadError = '';

  ngOnInit() {
    this.http
      .get<Jurisdiction[]>(this.base + '/jurisdictions')
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (rows) => {
          this.jurisdictions = rows;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'The jurisdiction list could not be loaded. Refresh this page to try again.';
          this.cdr.markForCheck();
        },
      });
  }
  ngOnChanges(changes: SimpleChanges) {
    if (changes['branchId']) this.loadBranch();
  }
  get availableJurisdictions() {
    if (!this.branchStateCode) return [];
    const state = this.jurisdictions.find((j) => j.code === this.branchStateCode) || {
      code: this.branchStateCode,
      name: this.branchStateCode,
    };
    return this.centralRulesAvailable
      ? [state, { code: 'CENTRAL', name: 'Central rules — confirmed branch jurisdiction' }]
      : [state];
  }
  loadBranch() {
    this.scopeChanged.next();
    this.actCode = '';
    this.submittedActCode = '';
    this.selectedForm = null;
    this.forms = [];
    this.info = null;
    this.query = '';
    this.jurisdiction = '';
    this.branchStateCode = '';
    this.branchName = '';
    this.centralRulesAvailable = false;
    this.loading = false;
    this.error = '';
    if (!this.branchId) return;
    this.loading = true;
    this.http
      .get<{
        branchId: string;
        branchName: string;
        stateCode: string;
        centralRulesAvailable: boolean;
      }>(this.base + '/branch-context', { params: new HttpParams().set('branchId', this.branchId) })
      .pipe(takeUntil(this.scopeChanged), takeUntil(this.destroyed))
      .subscribe({
        next: (context) => {
          if (context.branchId !== this.branchId) return;
          this.branchStateCode = context.stateCode;
          this.branchName = context.branchName;
          this.centralRulesAvailable = context.centralRulesAvailable;
          this.jurisdiction = context.stateCode;
          this.load();
        },
        error: (e) => {
          this.loading = false;
          this.error =
            typeof e?.error?.message === 'string'
              ? e.error.message
              : 'The selected branch state could not be loaded. Check its profile and retry.';
          this.cdr.markForCheck();
        },
      });
  }
  load() {
    this.scopeChanged.next();
    this.actCode = '';
    this.submittedActCode = '';
    this.query = '';
    this.selectedForm = null;
    this.forms = [];
    this.info = null;
    this.error = '';
    if (!this.branchId || !this.availableJurisdictions.some((j) => j.code === this.jurisdiction)) {
      this.loading = false;
      this.error = 'Select a branch with a valid state code';
      return;
    }
    this.loading = true;
    this.http
      .get<{ forms: LibraryForm[]; jurisdiction: Jurisdiction }>(this.base, {
        params: new HttpParams().set('jurisdiction', this.jurisdiction),
      })
      .pipe(takeUntil(this.scopeChanged), takeUntil(this.destroyed))
      .subscribe({
        next: (result) => {
          this.forms = result.forms;
          this.info = result.jurisdiction;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'Formats could not be loaded. Please retry.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }
  get acts() {
    const names: Record<string, string> = {
      WAGES_2019: 'Code on Wages, 2019',
      OSH_2020: 'OSH Code, 2020',
      SOCIAL_SECURITY_2020: 'Code on Social Security, 2020',
      IR_2020: 'Industrial Relations Code, 2020',
      CLRA_1970: 'Contract Labour Act, 1970',
      MULTI_ACT: 'Integrated registers under multiple Acts',
      TS_SHOPS_1988: 'Telangana Shops and Establishments Act, 1988',
      SHOPS_2017: 'Maharashtra Shops and Establishments Act, 2017',
      FACTORIES_1948: 'Factories Act, 1948',
    };
    return [...new Set(this.forms.map((f) => f.actCode))].map((code) => ({
      code,
      name: names[code] || code,
    }));
  }
  changeAct() {
    this.submittedActCode = '';
    this.selectedForm = null;
    this.query = '';
  }
  submitAct() {
    this.selectedForm = null;
    this.submittedActCode = this.acts.some((a) => a.code === this.actCode) ? this.actCode : '';
  }
  get visibleForms() {
    const q = this.query.trim().toLowerCase();
    return this.forms
      .filter((f) => !!this.submittedActCode && f.actCode === this.submittedActCode)
      .filter((f) =>
        [f.title, f.formNumber, f.ruleReference, f.source.title, f.actCode, f.rulesCode]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
  }
  sourceUrl(form: LibraryForm) {
    return form.source.url + (form.sourcePage ? '#page=' + form.sourcePage : '');
  }
  kindLabel(kind: string) {
    return (
      (
        {
          REGISTER: 'Register',
          AUTHORITY_REGISTER: 'Maintained by authority',
          WAGE_SLIP: 'Wage slip',
          NOTICE: 'Notice',
          RETURN: 'Return',
          CERTIFICATE: 'Certificate',
          CARD: 'Employment card',
        } as Record<string, string>
      )[kind] || kind
    );
  }
  download(form: LibraryForm) {
    this.downloadError = '';
    this.downloading = true;
    this.http
      .get(this.base + '/' + encodeURIComponent(form.id) + '/source', { responseType: 'blob' })
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = form.id + '-prescribed-source.pdf';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.downloading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.downloading = false;
          this.downloadError = 'Download failed. You can open the published source link.';
          this.cdr.markForCheck();
        },
      });
  }
  ngOnDestroy() {
    this.destroyed.next();
    this.destroyed.complete();
    this.scopeChanged.complete();
  }
}
