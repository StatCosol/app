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
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/toast/toast.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { Holiday, HolidayCalendarService, HolidayComp, HolidayWork } from './holiday-calendar.service';
import { PageHeaderComponent } from '../../../shared/ui';

interface BranchOpt { value: string; label: string; state: string | null; }

@Component({
  selector: 'app-client-holiday-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <ui-page-header
        title="Holiday Calendar"
        subtitle="Upload the year's holidays (per branch or state), then apply them onto attendance. Employees who work on a holiday can be paid double wage at payroll submission.">
      </ui-page-header>

      <!-- Upload + Apply toolbar -->
      <section class="card">
        <div class="row">
          <div class="field">
            <label>Upload holiday list (Excel)</label>
            <div class="inline">
              <input id="hc-file" type="file" accept=".xlsx,.xls,.csv" (change)="onFile($event)" />
              <button class="btn" [disabled]="!file || uploading" (click)="upload()">
                {{ uploading ? 'Uploading…' : 'Upload' }}
              </button>
            </div>
            <span class="hint">Columns: Date &nbsp;|&nbsp; Holiday Name &nbsp;|&nbsp; State Code (optional) &nbsp;|&nbsp; Paid (Y/N, optional)</span>
          </div>

          <div class="field">
            <label>Apply holidays to attendance</label>
            <div class="inline">
              <input type="month" [(ngModel)]="applyMonth" class="ctrl" />
              <select [(ngModel)]="applyBranchId" class="ctrl">
                <option value="">All branches</option>
                @for (b of branches; track b.value) {
                  <option [value]="b.value">{{ b.label }}</option>
                }
              </select>
              <button class="btn" [disabled]="applying" (click)="applyMonthNow()">
                {{ applying ? 'Applying…' : 'Apply to month' }}
              </button>
            </div>
            <span class="hint">Marks those days HOLIDAY for employees in scope. Days already worked are left as-is.</span>
          </div>
        </div>
      </section>

      <!-- Holiday work — double wage approval (at attendance→payroll submission) -->
      <section class="card">
        <div class="listHead">
          <div>
            <h2>Holiday Work — Double Wage Approval</h2>
            <span class="hint">Employees who worked on a holiday. Approve to pay 2× that day's wage in payroll; decline for normal pay.</span>
          </div>
          <div class="inline">
            <input type="month" [(ngModel)]="hwMonth" class="ctrl" />
            <select [(ngModel)]="hwBranchId" class="ctrl">
              <option value="">All branches</option>
              @for (b of branches; track b.value) { <option [value]="b.value">{{ b.label }}</option> }
            </select>
            <button class="btn ghost" [disabled]="hwLoading" (click)="loadHolidayWork()">{{ hwLoading ? 'Loading…' : 'Load' }}</button>
          </div>
        </div>
        @if (!hwLoading && !holidayWork.length) { <div class="muted">No holiday-work found for this month. (Upload &amp; apply holidays first, then mark attendance.)</div> }
        @if (holidayWork.length) {
          <div class="inline" style="margin-bottom:8px;">
            <span class="hint">{{ hwSelected.size }} selected — set compensation:</span>
            <button class="btn" [disabled]="!hwSelected.size || hwBusy" (click)="approve('DOUBLE')">Double wage (2×)</button>
            <button class="btn ghost" [disabled]="!hwSelected.size || hwBusy" (click)="approve('COFF')">Comp-off</button>
            <button class="btn ghost" [disabled]="!hwSelected.size || hwBusy" (click)="approve('SINGLE')">Single wage</button>
          </div>
          <div class="tableWrap">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" [checked]="allHwSelected" (change)="toggleAllHw($event)" /></th>
                  <th>Date</th><th>Employee</th><th>Branch</th><th>Holiday</th><th>In</th><th>Out</th><th>Hours</th><th>Compensation</th>
                </tr>
              </thead>
              <tbody>
                @for (w of holidayWork; track w.id) {
                  <tr>
                    <td><input type="checkbox" [checked]="hwSelected.has(w.id)" (change)="toggleHw(w.id)" /></td>
                    <td>{{ w.date | date:'d MMM' }}</td>
                    <td class="strong">{{ w.employeeName || w.employeeCode }}</td>
                    <td class="muted">{{ w.branchName || '-' }}</td>
                    <td>{{ w.holidayName }}</td>
                    <td>{{ w.checkIn || '-' }}</td>
                    <td>{{ w.checkOut || '-' }}</td>
                    <td>{{ w.workedHours || '-' }}</td>
                    <td>
                      <span class="pill" [class.ok]="w.doubleWage === 'DOUBLE'" [class.coff]="w.doubleWage === 'COFF'" [class.no]="w.doubleWage === 'SINGLE'">
                        {{ compLabel(w.doubleWage) }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- Add single holiday -->
      <section class="card">
        <div class="row">
          <div class="field"><label>Date</label><input type="date" [(ngModel)]="form.holidayDate" class="ctrl" /></div>
          <div class="field grow"><label>Holiday name</label><input type="text" [(ngModel)]="form.name" placeholder="e.g. Independence Day" class="ctrl" /></div>
          <div class="field">
            <label>Scope</label>
            <select [(ngModel)]="form.scope" class="ctrl">
              <option value="CLIENT">All branches</option>
              <option value="STATE">A state</option>
              <option value="BRANCH">A branch</option>
            </select>
          </div>
          @if (form.scope === 'STATE') {
            <div class="field"><label>State code</label><input type="text" [(ngModel)]="form.stateCode" placeholder="e.g. KA" class="ctrl" maxlength="10" /></div>
          }
          @if (form.scope === 'BRANCH') {
            <div class="field">
              <label>Branch</label>
              <select [(ngModel)]="form.branchId" class="ctrl">
                <option value="">Select branch</option>
                @for (b of branches; track b.value) { <option [value]="b.value">{{ b.label }}</option> }
              </select>
            </div>
          }
          <div class="field">
            <label>Paid</label>
            <label class="chk"><input type="checkbox" [(ngModel)]="form.isPaid" /> Paid holiday</label>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button class="btn" [disabled]="adding" (click)="add()">{{ adding ? 'Adding…' : 'Add holiday' }}</button>
          </div>
        </div>
      </section>

      <!-- List -->
      <section class="card">
        <div class="listHead">
          <h2>Holidays</h2>
          <div class="inline">
            <label class="hint">Year</label>
            <input type="number" [(ngModel)]="year" (change)="load()" class="ctrl narrow" />
            <button class="btn ghost" (click)="load()">Refresh</button>
          </div>
        </div>
        @if (loading) { <div class="muted">Loading…</div> }
        @if (!loading && !holidays.length) { <div class="muted">No holidays added for {{ year }} yet. Upload a list or add one above.</div> }
        @if (!loading && holidays.length) {
          <div class="tableWrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Day</th><th>Holiday</th><th>Scope</th><th>Paid</th><th></th></tr>
              </thead>
              <tbody>
                @for (h of holidays; track h.id) {
                  <tr>
                    <td>{{ h.holidayDate | date:'d MMM y' }}</td>
                    <td class="muted">{{ h.holidayDate | date:'EEE' }}</td>
                    <td class="strong">{{ h.name }}</td>
                    <td>{{ scopeLabel(h) }}</td>
                    <td>{{ h.isPaid ? 'Paid' : 'Unpaid' }}</td>
                    <td><button class="link-danger" (click)="remove(h)">Delete</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }
    .header { margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
    .sub { margin: 4px 0 0; font-size: 12px; color: #64748b; max-width: 780px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
    .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field.grow { flex: 1 1 220px; }
    label { font-size: 12px; color: #475569; font-weight: 600; }
    .ctrl { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; background: #fff; min-width: 150px; }
    .ctrl.narrow { min-width: 90px; width: 90px; }
    .inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .chk { font-size: 13px; color: #374151; display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
    .hint { font-size: 11px; color: #94a3b8; }
    .btn { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
    .btn.ghost { background: #f8fafc; color: #334155; border: 1px solid #d1d5db; }
    .listHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
    .listHead h2 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0; }
    .tableWrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; background: #f8fafc; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #1f2937; }
    td.strong { font-weight: 600; color: #0f172a; }
    .muted { color: #94a3b8; font-size: 13px; padding: 8px 2px; }
    .link-danger { background: none; border: none; color: #b91c1c; font-weight: 600; font-size: 12px; cursor: pointer; padding: 0; }
    .link-danger:hover { text-decoration: underline; }
    .pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; color: #475569; }
    .pill.ok { background: #dcfce7; color: #15803d; }
    .pill.coff { background: #dbeafe; color: #1e40af; }
    .pill.no { background: #f1f5f9; color: #475569; }
  `],
})
export class ClientHolidayCalendarComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  year = new Date().getFullYear();
  holidays: Holiday[] = [];
  branches: BranchOpt[] = [];
  loading = false;

  file: File | null = null;
  uploading = false;

  applyMonth = new Date().toISOString().slice(0, 7);
  applyBranchId = '';
  applying = false;

  adding = false;
  form: { holidayDate: string; name: string; scope: 'CLIENT' | 'STATE' | 'BRANCH'; stateCode: string; branchId: string; isPaid: boolean } = {
    holidayDate: '', name: '', scope: 'CLIENT', stateCode: '', branchId: '', isPaid: true,
  };

  // Holiday-work double-wage approval
  hwMonth = new Date().toISOString().slice(0, 7);
  hwBranchId = '';
  holidayWork: HolidayWork[] = [];
  hwSelected = new Set<string>();
  hwLoading = false;
  hwBusy = false;

  constructor(
    private readonly svc: HolidayCalendarService,
    private readonly branchSvc: ClientBranchesService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBranches();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadBranches(): void {
    this.branchSvc.list().pipe(takeUntil(this.destroy$), catchError(() => of([]))).subscribe((rows: any[]) => {
      this.branches = (rows || []).map((b) => ({
        value: b.id,
        label: b.branchname || b.branchName || b.name || b.id,
        state: b.statecode || b.stateCode || null,
      }));
      this.cdr.markForCheck();
    });
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.svc.list(this.year).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (rows) => { this.holidays = rows || []; },
      error: () => { this.toast.error('Failed to load holidays'); this.holidays = []; },
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.file = input.files && input.files.length ? input.files[0] : null;
  }

  upload(): void {
    if (!this.file) return;
    this.uploading = true;
    this.cdr.markForCheck();
    this.svc.upload(this.file).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => {
        this.file = null;
        const errNote = res.errors?.length ? ` (${res.errors.length} row error(s))` : '';
        this.toast.success(`Uploaded: ${res.created} added, ${res.skipped} skipped${errNote}`);
        this.load();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Upload failed'),
    });
  }

  add(): void {
    if (!this.form.holidayDate || !this.form.name.trim()) {
      this.toast.error('Date and holiday name are required');
      return;
    }
    if (this.form.scope === 'BRANCH' && !this.form.branchId) { this.toast.error('Select a branch'); return; }
    if (this.form.scope === 'STATE' && !this.form.stateCode.trim()) { this.toast.error('Enter a state code'); return; }
    this.adding = true;
    this.cdr.markForCheck();
    this.svc.add({
      holidayDate: this.form.holidayDate,
      name: this.form.name.trim(),
      branchId: this.form.scope === 'BRANCH' ? this.form.branchId : null,
      stateCode: this.form.scope === 'STATE' ? this.form.stateCode.trim().toUpperCase() : null,
      isPaid: this.form.isPaid,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.adding = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.toast.success('Holiday added');
        this.form = { holidayDate: '', name: '', scope: 'CLIENT', stateCode: '', branchId: '', isPaid: true };
        this.load();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to add holiday'),
    });
  }

  applyMonthNow(): void {
    const m = /^(\d{4})-(\d{2})$/.exec(this.applyMonth);
    if (!m) { this.toast.error('Pick a valid month'); return; }
    this.applying = true;
    this.cdr.markForCheck();
    this.svc.apply(Number(m[1]), Number(m[2]), this.applyBranchId || undefined).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.applying = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => this.toast.success(`Applied — ${res.holidaysMarked} day(s) marked as holiday (${res.created} new, ${res.updated} updated)`),
      error: (e) => this.toast.error(e?.error?.message || 'Failed to apply holidays'),
    });
  }

  remove(h: Holiday): void {
    if (!confirm(`Delete holiday "${h.name}" on ${h.holidayDate}?`)) return;
    this.svc.remove(h.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Holiday deleted'); this.load(); },
      error: () => this.toast.error('Failed to delete holiday'),
    });
  }

  get allHwSelected(): boolean {
    return this.holidayWork.length > 0 && this.hwSelected.size === this.holidayWork.length;
  }

  loadHolidayWork(): void {
    const m = /^(\d{4})-(\d{2})$/.exec(this.hwMonth);
    if (!m) { this.toast.error('Pick a valid month'); return; }
    this.hwLoading = true;
    this.hwSelected.clear();
    this.cdr.markForCheck();
    this.svc.listHolidayWork(Number(m[1]), Number(m[2]), this.hwBranchId || undefined).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.hwLoading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (rows) => { this.holidayWork = rows || []; },
      error: () => { this.toast.error('Failed to load holiday work'); this.holidayWork = []; },
    });
  }

  toggleHw(id: string): void {
    if (this.hwSelected.has(id)) this.hwSelected.delete(id);
    else this.hwSelected.add(id);
  }

  toggleAllHw(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.hwSelected = checked ? new Set(this.holidayWork.map((w) => w.id)) : new Set();
  }

  approve(comp: HolidayComp): void {
    const ids = Array.from(this.hwSelected);
    if (!ids.length) return;
    this.hwBusy = true;
    this.cdr.markForCheck();
    this.svc.approveHolidayWork(ids, comp).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.hwBusy = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.toast.success(`Set to ${this.compLabel(comp)}`);
        this.loadHolidayWork();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to update'),
    });
  }

  compLabel(comp: HolidayComp | null): string {
    switch (comp) {
      case 'DOUBLE': return 'Double wage (2×)';
      case 'COFF': return 'Comp-off';
      case 'SINGLE': return 'Single wage';
      default: return 'Pending';
    }
  }

  scopeLabel(h: Holiday): string {
    if (h.branchId) {
      const b = this.branches.find((x) => x.value === h.branchId);
      return b ? `Branch: ${b.label}` : 'Branch';
    }
    if (h.stateCode) return `State: ${h.stateCode}`;
    return 'All branches';
  }
}
