import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CrmService } from '../../../core/crm.service';
import {
  ClientContextStripComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';

const SKILLS: Array<[string, string]> = [
  ['UNSKILLED', 'Unskilled'],
  ['SEMI_SKILLED', 'Semi-skilled'],
  ['SKILLED', 'Skilled'],
  ['HIGHLY_SKILLED', 'Highly skilled'],
];

/**
 * Contractor quotations side by side: every vendor's rate in force on a date,
 * worked out per head for that month, so quotations laid out and calculated
 * differently compare on what the worker gets, what the client pays and the
 * gap between them.
 */
@Component({
  standalone: true,
  selector: 'app-crm-quotation-comparison',
  imports: [FormsModule, PageHeaderComponent, ClientContextStripComponent, LoadingSpinnerComponent],
  template: `
    <div class="page">
      <ui-page-header
        title="Quotation Comparison"
        description="Contractor quotations per head: paid to the worker, billed to the client, and the gap"
        icon="scale">
        <ui-client-context-strip [inline]="true"></ui-client-context-strip>
      </ui-page-header>

      <div class="filters">
        @if (!lockedClientId) {
          <label><span>Client</span>
            <select [(ngModel)]="clientId" (ngModelChange)="branchId = ''; load()">
              <option value="">Select client</option>
              @for (c of clients; track c.id) {<option [value]="c.id">{{ c.clientName }}</option>}
            </select>
          </label>
        }
        <label><span>Site</span>
          <select [(ngModel)]="branchId" (ngModelChange)="load()">
            <option value="">All sites</option>
            @for (b of branches; track b.id) {<option [value]="b.id">{{ b.name }}</option>}
          </select>
        </label>
        <label><span>Rates in force on</span>
          <input type="date" [(ngModel)]="onDate" (ngModelChange)="load()" />
        </label>
        <label><span>Skill</span>
          <select [(ngModel)]="skill" (ngModelChange)="load()">
            <option value="">All skills</option>
            @for (s of skills; track s[0]) {<option [value]="s[0]">{{ s[1] }}</option>}
          </select>
        </label>
      </div>

      @if (loading) {<ui-loading-spinner text="Working out quotations..."></ui-loading-spinner>}
      @if (!loading && !clientId) {<div class="empty">Select a client to compare its contractors' quotations.</div>}
      @if (!loading && clientId && !rows.length) {<div class="empty">No quotation is in force on {{ onDate }} for this selection.</div>}

      @if (!loading && rows.length) {
        <p class="note">Per head for a full month of {{ payDays }} working days ({{ onDate.slice(0, 7) }}). <strong>Gap</strong> is what the client is billed over and above what the worker is paid. Within each skill the lowest billing is marked.</p>
        @for (group of groups; track group.skill) {
          <section class="group">
            <h3>{{ skillLabel(group.skill) }} <small>{{ group.rows.length }} quotation(s)</small></h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contractor / role</th>
                    <th class="num">Basic + DA</th>
                    <th class="num">Paid to worker</th>
                    <th class="num">Net pay</th>
                    <th class="num">Statutory &amp; costs</th>
                    <th class="num">Vendor fee</th>
                    <th class="num">Billed</th>
                    <th class="num">Per day</th>
                    <th class="num">Gap</th>
                    <th>Checks</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of group.rows; track r.quotationId) {
                    <tr [class.best]="r.quotationId === group.lowestId" (click)="toggle(r)">
                      <td>
                        <strong>{{ r.contractorName || 'Contractor' }}</strong>
                        @if (r.quotationId === group.lowestId) {<span class="tag">Lowest billing</span>}
                        <div class="muted">{{ r.designation || 'All designations' }} · {{ r.branchName || 'All sites' }} · from {{ r.effectiveFrom }}</div>
                      </td>
                      @if (r.hasBreakup) {
                        <td class="num">{{ money(r.basic) }}</td>
                        <td class="num">{{ money(r.workerPaid) }}</td>
                        <td class="num">{{ money(r.netPay) }}</td>
                        <td class="num">{{ money(r.employerCosts) }}</td>
                        <td class="num">{{ money(r.fees) }}</td>
                        <td class="num strong">{{ money(r.billingTotal) }}</td>
                        <td class="num">{{ money(r.perDay) }}</td>
                        <td class="num">{{ money(r.gap) }}<div class="muted">{{ r.gapPercent }}%</div></td>
                        <td>
                          @if (errors(r)) {<span class="chip chip--error">{{ errors(r) }} not compliant</span>}
                          @if (warnings(r)) {<span class="chip chip--warn">{{ warnings(r) }} to check</span>}
                          @if (!errors(r) && !warnings(r)) {<span class="chip chip--ok">OK</span>}
                        </td>
                      } @else {
                        <td class="num">{{ money(r.basic) }}</td>
                        <td colspan="8" class="muted">{{ r.error || 'Daily wage only (' + money(r.dailyWage) + '/day): no component breakup to compare. Upload the vendor breakup.' }}</td>
                      }
                    </tr>
                    @if (open.has(r.quotationId) && r.hasBreakup) {
                      <tr class="detail">
                        <td colspan="10">
                          <div class="detail-grid">
                            <div>
                              <h4>Paid to the worker</h4>
                              @for (l of linesOf(r, 'EARNING'); track l.code) {<p><span>{{ l.label }}@if (l.billable === false) { <em>(billed separately)</em>}</span><span>{{ money(l.amount) }}</span></p>}
                              <h4>Deducted</h4>
                              @for (l of linesOf(r, 'DEDUCTION'); track l.code) {<p><span>{{ l.label }}</span><span>{{ money(l.amount) }}</span></p>}
                            </div>
                            <div>
                              <h4>Billed on top</h4>
                              @for (l of linesOf(r, 'EMPLOYER_COST'); track l.code) {<p><span>{{ l.label }}</span><span>{{ money(l.amount) }}</span></p>}
                              @for (l of linesOf(r, 'BILLING_FEE'); track l.code) {<p><span>{{ l.label }} (fee)</span><span>{{ money(l.amount) }}</span></p>}
                            </div>
                            <div>
                              <h4>Statutory checks</h4>
                              @for (f of r.compliance; track $index) {<p [class.error]="f.severity === 'ERROR'" [class.warn]="f.severity !== 'ERROR'">{{ f.message }}</p>}
                              @if (!r.compliance?.length) {<p class="ok">All checks pass.</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .page { max-width: 1320px; margin: 0 auto; padding: 1.5rem; }
    .filters { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; align-items: end; }
    label { display: grid; gap: 0.35rem; color: #374151; font-size: 0.85rem; font-weight: 700; }
    select, input { min-width: 180px; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.55rem 0.7rem; background: #fff; }
    .empty { padding: 1rem; border: 1px dashed #d1d5db; border-radius: 8px; color: #6b7280; }
    .note { color: #4b5563; font-size: 0.85rem; }
    .group { margin: 1.25rem 0; }
    .group h3 { font-size: 1rem; font-weight: 800; color: #111827; margin-bottom: 0.5rem; }
    .group h3 small { color: #6b7280; font-weight: 500; margin-left: 0.5rem; }
    .table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; background: #f9fafb; color: #374151; padding: 0.55rem 0.6rem; white-space: nowrap; border-bottom: 1px solid #e5e7eb; }
    td { padding: 0.55rem 0.6rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    tbody tr:not(.detail) { cursor: pointer; }
    tbody tr:not(.detail):hover { background: #f9fafb; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 800; color: #111827; }
    .muted { color: #6b7280; font-size: 0.75rem; }
    .best { background: #f0fdf4; }
    .tag { margin-left: 0.4rem; font-size: 0.65rem; font-weight: 800; color: #166534; background: #dcfce7; border-radius: 999px; padding: 0.1rem 0.45rem; }
    .chip { display: inline-block; margin: 0 0.25rem 0.25rem 0; font-size: 0.7rem; font-weight: 700; border-radius: 999px; padding: 0.1rem 0.5rem; white-space: nowrap; }
    .chip--error { background: #fee2e2; color: #991b1b; }
    .chip--warn { background: #fef3c7; color: #92400e; }
    .chip--ok { background: #dcfce7; color: #166534; }
    .detail td { background: #fafafa; }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; }
    .detail h4 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin: 0.5rem 0 0.25rem; }
    .detail p { display: flex; justify-content: space-between; gap: 1rem; margin: 0.15rem 0; font-size: 0.8rem; }
    .detail p.error { color: #b91c1c; display: block; }
    .detail p.warn { color: #b45309; display: block; }
    .detail p.ok { color: #166534; display: block; }
  `],
})
export class CrmQuotationComparisonComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly baseUrl = environment.apiBaseUrl || '';
  readonly skills = SKILLS;

  clients: any[] = [];
  branches: Array<{ id: string; name: string }> = [];
  rows: any[] = [];
  groups: Array<{ skill: string; rows: any[]; lowestId: string | null }> = [];
  open = new Set<string>();
  loading = false;
  clientId = '';
  lockedClientId = '';
  branchId = '';
  onDate = new Date().toISOString().slice(0, 10);
  skill = '';
  payDays = 0;

  constructor(
    private http: HttpClient,
    private crm: CrmService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.lockedClientId = this.route.snapshot.paramMap.get('clientId') || '';
    this.clientId = this.lockedClientId;
    this.crm.getAssignedClientsCached().pipe(takeUntil(this.destroy$)).subscribe((clients: any) => {
      this.clients = clients || [];
      if (!this.clientId && this.clients.length === 1) this.clientId = this.clients[0].id;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    if (!this.clientId) {
      this.rows = [];
      this.groups = [];
      return;
    }
    const params: Record<string, string> = { clientId: this.clientId, onDate: this.onDate };
    if (this.branchId) params['branchId'] = this.branchId;
    if (this.skill) params['skillCategory'] = this.skill;
    this.loading = true;
    this.http
      .get<any>(`${this.baseUrl}/api/v1/crm/contractor-computation/quotations/comparison`, { params })
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.show(res),
        error: () => this.show(null),
      });
  }

  show(res: any): void {
    this.rows = res?.rows || [];
    this.payDays = res?.payDays || 0;
    // Keep every site offered while one is selected.
    if (!this.branchId) this.branches = res?.branches || [];
    this.groups = groupBySkill(this.rows);
  }

  toggle(row: any): void {
    if (this.open.has(row.quotationId)) this.open.delete(row.quotationId);
    else this.open.add(row.quotationId);
  }

  linesOf(row: any, category: string) {
    return (row.lines || []).filter((l: any) => l.category === category && l.amount);
  }

  errors(row: any) {
    return (row.compliance || []).filter((f: any) => f.severity === 'ERROR').length;
  }

  warnings(row: any) {
    return (row.compliance || []).filter((f: any) => f.severity !== 'ERROR').length;
  }

  skillLabel(skill: string) {
    return SKILLS.find(([s]) => s === skill)?.[1] ?? skill;
  }

  money(value: unknown): string {
    const n = Number(value);
    return value == null || !Number.isFinite(n)
      ? '-'
      : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

/** Rows by skill, in skill order, with the lowest-billing quotation marked. */
export function groupBySkill(rows: any[]) {
  const order = SKILLS.map(([s]) => s);
  const skills = [...new Set(rows.map((r) => r.skillCategory))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  return skills.map((skill) => {
    const inSkill = rows.filter((r) => r.skillCategory === skill);
    const priced = inSkill.filter((r) => r.hasBreakup && r.billingTotal != null);
    const lowest = priced.length > 1
      ? priced.reduce((a, b) => (b.billingTotal < a.billingTotal ? b : a))
      : null;
    return { skill, rows: inSkill, lowestId: lowest?.quotationId ?? null };
  });
}
