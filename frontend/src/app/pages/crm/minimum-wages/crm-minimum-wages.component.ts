import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import {
  ActionButtonComponent,
  DataTableComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  CrmMinimumWagesService,
  MinimumWageRow,
  MinimumWageSkill,
  UpsertWagePayload,
} from '../../../core/crm-minimum-wages.service';

const SKILL_OPTIONS: MinimumWageSkill[] = [
  'UNSKILLED',
  'SEMI_SKILLED',
  'SKILLED',
  'HIGHLY_SKILLED',
];

interface FormState extends UpsertWagePayload {
  id?: string | null;
}

@Component({
  standalone: true,
  selector: 'app-crm-minimum-wages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
  ],
  template: `
    <ui-page-header
      title="Minimum Wages"
      subtitle="Statutory minimum wage master. Upload refreshed rates every April and October."
    ></ui-page-header>

    <!-- Filters -->
    <div class="card mb-4 p-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">State Code</label>
          <input type="text" name="fState" [(ngModel)]="filters.stateCode"
            placeholder="e.g. KA" maxlength="8"
            class="w-full rounded-lg border-gray-300 focus:border-statco-blue-light focus:ring-statco-blue-light uppercase" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Skill</label>
          <select name="fSkill" [(ngModel)]="filters.skillCategory"
            class="w-full rounded-lg border-gray-300">
            <option value="">All</option>
            <option *ngFor="let s of skills" [value]="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Schedule of Employment</label>
          <input type="text" name="fSched" [(ngModel)]="filters.scheduledEmployment"
            placeholder="exact match"
            class="w-full rounded-lg border-gray-300" />
        </div>
        <div class="flex items-end gap-2">
          <ui-button variant="primary" (clicked)="load()">Apply</ui-button>
          <ui-button variant="secondary" (clicked)="resetFilters()">Reset</ui-button>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <ui-button variant="primary" (clicked)="openAdd()">+ Add Wage</ui-button>
      <ui-button variant="secondary" (clicked)="downloadTemplate()">Download Template</ui-button>
      <label class="inline-flex items-center px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium rounded cursor-pointer">
        Bulk Upload (Excel)
        <input type="file" accept=".xlsx,.xls,.csv" (change)="onBulkFile($event)" hidden />
      </label>
      <span class="text-xs text-gray-500 ml-auto">{{ rows.length }} row(s)</span>
    </div>

    <ui-loading-spinner *ngIf="loading" size="md" color="primary"></ui-loading-spinner>

    <ui-data-table
      *ngIf="!loading"
      [columns]="cols"
      [data]="rows"
      emptyMessage="No minimum-wage rows found.">
      <ng-template uiTableCell="monthlyWage" let-row>₹{{ row.monthlyWage | number:'1.2-2' }}</ng-template>
      <ng-template uiTableCell="dailyWage" let-row>{{ row.dailyWage !== null && row.dailyWage !== undefined ? '₹' + (row.dailyWage | number:'1.2-2') : '—' }}</ng-template>
      <ng-template uiTableCell="effectiveTo" let-row>{{ row.effectiveTo || '—' }}</ng-template>
      <ng-template uiTableCell="scheduledEmployment" let-row>{{ row.scheduledEmployment || 'Default' }}</ng-template>
      <ng-template uiTableCell="actions" let-row>
        <div class="flex gap-2">
          <button class="text-blue-600 hover:underline text-sm" (click)="openEdit(row)">Edit</button>
          <button class="text-red-600 hover:underline text-sm" (click)="remove(row)">Delete</button>
        </div>
      </ng-template>
    </ui-data-table>

    <!-- Add/Edit Modal -->
    <div *ngIf="showForm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4"
      (click)="cancelForm()">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6"
        (click)="$event.stopPropagation()">
        <h3 class="text-lg font-semibold mb-4">{{ form.id ? 'Edit' : 'Add' }} Minimum Wage</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">State Code *</label>
            <input type="text" maxlength="8" [(ngModel)]="form.stateCode"
              class="w-full rounded-lg border-gray-300 uppercase" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Skill Category *</label>
            <select [(ngModel)]="form.skillCategory" class="w-full rounded-lg border-gray-300">
              <option *ngFor="let s of skills" [value]="s">{{ s }}</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Schedule of Employment</label>
            <input type="text" [(ngModel)]="form.scheduledEmployment"
              placeholder="leave blank for default / wildcard"
              class="w-full rounded-lg border-gray-300" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Wage *</label>
            <input type="number" min="0" step="0.01" [(ngModel)]="form.monthlyWage"
              class="w-full rounded-lg border-gray-300" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Daily Wage</label>
            <input type="number" min="0" step="0.01" [(ngModel)]="form.dailyWage"
              class="w-full rounded-lg border-gray-300" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Effective From *</label>
            <input type="date" [(ngModel)]="form.effectiveFrom"
              class="w-full rounded-lg border-gray-300" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Effective To</label>
            <input type="date" [(ngModel)]="form.effectiveTo"
              class="w-full rounded-lg border-gray-300" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input type="text" [(ngModel)]="form.source"
              placeholder="e.g. Govt notification dated 01-Apr-2026"
              class="w-full rounded-lg border-gray-300" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows="2" [(ngModel)]="form.notes" class="w-full rounded-lg border-gray-300"></textarea>
          </div>
        </div>
        <div class="flex gap-2 mt-4 justify-end">
          <ui-button variant="secondary" (clicked)="cancelForm()">Cancel</ui-button>
          <ui-button variant="primary" (clicked)="save()" [disabled]="saving">
            {{ saving ? 'Saving...' : 'Save' }}
          </ui-button>
        </div>
      </div>
    </div>
  `,
})
export class CrmMinimumWagesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  readonly skills = SKILL_OPTIONS;

  loading = true;
  saving = false;
  showForm = false;
  rows: MinimumWageRow[] = [];

  filters = {
    stateCode: '',
    skillCategory: '' as MinimumWageSkill | '',
    scheduledEmployment: '',
  };

  form: FormState = this.emptyForm();

  readonly cols: TableColumn[] = [
    { key: 'stateCode', header: 'State', width: '8%' },
    { key: 'skillCategory', header: 'Skill', width: '14%' },
    { key: 'scheduledEmployment', header: 'Schedule', width: '20%' },
    { key: 'monthlyWage', header: 'Monthly', width: '12%' },
    { key: 'dailyWage', header: 'Daily', width: '10%' },
    { key: 'effectiveFrom', header: 'From', width: '10%' },
    { key: 'effectiveTo', header: 'To', width: '10%' },
    { key: 'source', header: 'Source', width: '10%' },
    { key: 'actions', header: 'Actions', width: '10%' },
  ];

  constructor(
    private api: CrmMinimumWagesService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.api
      .list({
        stateCode: this.filters.stateCode?.trim() || undefined,
        skillCategory: this.filters.skillCategory || undefined,
        scheduledEmployment: this.filters.scheduledEmployment?.trim() || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.rows = res?.data || [];
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to load minimum wages');
        },
      });
  }

  resetFilters(): void {
    this.filters = { stateCode: '', skillCategory: '', scheduledEmployment: '' };
    this.load();
  }

  openAdd(): void {
    this.form = this.emptyForm();
    this.showForm = true;
  }

  openEdit(row: MinimumWageRow): void {
    this.form = {
      id: row.id,
      stateCode: row.stateCode,
      skillCategory: row.skillCategory,
      scheduledEmployment: row.scheduledEmployment ?? '',
      monthlyWage: row.monthlyWage,
      dailyWage: row.dailyWage ?? null,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? '',
      source: row.source ?? '',
      notes: row.notes ?? '',
    };
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
    this.form = this.emptyForm();
  }

  save(): void {
    const f = this.form;
    if (!f.stateCode?.trim() || !f.skillCategory || f.monthlyWage == null || !f.effectiveFrom) {
      this.toast.warning('State, Skill, Monthly Wage, and Effective From are required');
      return;
    }
    const payload: UpsertWagePayload = {
      stateCode: f.stateCode.trim().toUpperCase(),
      skillCategory: f.skillCategory,
      scheduledEmployment: f.scheduledEmployment?.toString().trim() || null,
      monthlyWage: Number(f.monthlyWage),
      dailyWage: f.dailyWage != null && f.dailyWage !== ('' as any) ? Number(f.dailyWage) : null,
      effectiveFrom: f.effectiveFrom,
      effectiveTo: f.effectiveTo?.toString().trim() || null,
      source: f.source?.toString().trim() || null,
      notes: f.notes?.toString().trim() || null,
    };
    this.saving = true;
    this.cdr.markForCheck();
    const obs = f.id
      ? this.api.update(f.id, payload)
      : this.api.create(payload);
    obs
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(f.id ? 'Updated' : 'Added');
          this.showForm = false;
          this.load();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Save failed');
        },
      });
  }

  remove(row: MinimumWageRow): void {
    if (!confirm(`Delete minimum wage row for ${row.stateCode} / ${row.skillCategory}?`)) return;
    this.api.remove(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Deleted');
        this.load();
      },
      error: (err) => this.toast.error(err?.error?.message || 'Delete failed'),
    });
  }

  // ── Bulk Excel upload ──
  downloadTemplate(): void {
    const headers = [
      'stateCode',
      'skillCategory',
      'scheduledEmployment',
      'monthlyWage',
      'dailyWage',
      'effectiveFrom',
      'effectiveTo',
      'source',
      'notes',
    ];
    const sample = [
      {
        stateCode: 'KA',
        skillCategory: 'UNSKILLED',
        scheduledEmployment: 'Shops & Establishments',
        monthlyWage: 17500,
        dailyWage: 673,
        effectiveFrom: '2026-04-01',
        effectiveTo: '',
        source: 'Karnataka Govt notification dated 01-Apr-2026',
        notes: '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MinimumWages');
    XLSX.writeFile(wb, 'minimum-wages-template.xlsx');
  }

  onBulkFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
        if (!rows.length) {
          this.toast.warning('Sheet is empty');
          input.value = '';
          return;
        }
        this.bulkUpload(rows);
      } catch (e: any) {
        this.toast.error(`Failed to parse file: ${e?.message || e}`);
      } finally {
        input.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private async bulkUpload(rows: any[]): Promise<void> {
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    this.loading = true;
    this.cdr.markForCheck();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const skill = String(r.skillCategory || '').toUpperCase().replace(/[\s-]+/g, '_') as MinimumWageSkill;
      if (!SKILL_OPTIONS.includes(skill)) {
        failed++;
        errors.push(`Row ${i + 2}: invalid skillCategory`);
        continue;
      }
      const payload: UpsertWagePayload = {
        stateCode: String(r.stateCode || '').trim().toUpperCase(),
        skillCategory: skill,
        scheduledEmployment: r.scheduledEmployment ? String(r.scheduledEmployment).trim() : null,
        monthlyWage: Number(r.monthlyWage),
        dailyWage: r.dailyWage !== '' && r.dailyWage != null ? Number(r.dailyWage) : null,
        effectiveFrom: this.normaliseDate(r.effectiveFrom),
        effectiveTo: r.effectiveTo ? this.normaliseDate(r.effectiveTo) : null,
        source: r.source ? String(r.source) : null,
        notes: r.notes ? String(r.notes) : null,
      };
      if (!payload.stateCode || !payload.effectiveFrom || !Number.isFinite(payload.monthlyWage)) {
        failed++;
        errors.push(`Row ${i + 2}: missing stateCode, effectiveFrom, or monthlyWage`);
        continue;
      }
      try {
        await this.api.create(payload).toPromise();
        ok++;
      } catch (err: any) {
        failed++;
        errors.push(`Row ${i + 2}: ${err?.error?.message || err?.message || 'create failed'}`);
      }
    }
    this.loading = false;
    this.cdr.markForCheck();
    this.load();
    if (failed === 0) {
      this.toast.success(`Uploaded ${ok} row(s)`);
    } else {
      this.toast.warning(`Uploaded ${ok}; ${failed} failed. ${errors.slice(0, 3).join(' | ')}`);
    }
  }

  private normaliseDate(v: any): string {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // dd/mm/yyyy or dd-mm-yyyy
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  private emptyForm(): FormState {
    return {
      id: null,
      stateCode: '',
      skillCategory: 'UNSKILLED',
      scheduledEmployment: '',
      monthlyWage: 0,
      dailyWage: null,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      source: '',
      notes: '',
    };
  }
}
