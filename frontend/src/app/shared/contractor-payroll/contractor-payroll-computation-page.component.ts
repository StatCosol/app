import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, Observable, of, Subject } from 'rxjs';
import { catchError, expand, finalize, map, reduce, retry, switchMap, takeUntil, timeout } from 'rxjs/operators';

type Portal = 'contractor' | 'client' | 'branch' | 'auditor';
interface ComputationPage {
  data: any[];
  total: number;
  limit: number;
  offset: number;
}

interface LoadResult {
  rows: any[];
  error?: string;
}

@Component({
  standalone: true,
  selector: 'app-contractor-payroll-computation-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="hero">
        <div>
          <p class="eyebrow">Contractor Payroll</p>
          <h1>{{ title }}</h1>
          <p class="subtitle">
            Wage, statutory deduction, employer contribution and exception view generated from contractor attendance/muster uploads.
          </p>
        </div>
        <button type="button" class="btn" (click)="load()" [disabled]="loading">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </header>

      <section class="filters">
        <label>
          <span>Period</span>
          <input type="month" [(ngModel)]="periodMonth" (ngModelChange)="load()" />
        </label>
        @if (needsClientFilter) {
          <label>
            <span>Client ID</span>
            <input type="text" placeholder="Required for auditor view" [(ngModel)]="clientId" />
          </label>
          <button type="button" class="btn secondary" (click)="load()">Apply</button>
        }
        <label>
          <span>Status</span>
          <select [(ngModel)]="matchStatus" (ngModelChange)="load()">
            <option value="">All</option>
            <option value="MATCHED">Matched</option>
            <option value="MISMATCH">Mismatch</option>
            <option value="NO_QUOTATION">No quotation</option>
          </select>
        </label>
      </section>

      @if (loading) {
        <div class="state">Loading generated contractor payroll...</div>
      }

      @if (!loading && error) {
        <div class="state error">{{ error }}</div>
      }

      @if (!loading && !error) {
        <section class="summary">
          <div><strong>{{ rows.length }}</strong><span>Rows</span></div>
          <div><strong>{{ money(total('grossWage')) }}</strong><span>Gross wage</span></div>
          <div><strong>{{ money(total('netSalary')) }}</strong><span>Net salary</span></div>
          <div><strong>{{ money(total('totalEmployerContribution')) }}</strong><span>Employer contribution</span></div>
          <div><strong>{{ exceptionCount }}</strong><span>Exceptions</span></div>
        </section>

        <div class="table-card">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Branch / Contractor</th>
                <th>Employee</th>
                <th>Skill</th>
                <th class="num">Days</th>
                <th class="num">Daily Wage</th>
                <th class="num">Gross</th>
                <th class="num">PF / ESI</th>
                <th class="num">PT / LWF</th>
                <th class="num">Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.id) {
                <tr>
                  <td>{{ row.periodMonth || '-' }}</td>
                  <td>
                    <strong>{{ row.branchName || 'All branches' }}</strong>
                    <small>{{ row.contractorName || row.contractorUserId || '-' }}</small>
                  </td>
                  <td>
                    <strong>{{ row.employeeName || '-' }}</strong>
                    <small>{{ row.employeeCode || 'No code' }}</small>
                  </td>
                  <td>{{ row.skillCategory || '-' }}</td>
                  <td class="num">{{ row.daysWorked || 0 }}</td>
                  <td class="num">
                    <div>Pay {{ money(row.payableDailyWage) }}</div>
                    <small>Quote {{ money(row.quotationDailyWage) }} / Min {{ money(row.minimumDailyWage) }}</small>
                  </td>
                  <td class="num">{{ money(row.grossWage) }}</td>
                  <td class="num">
                    <div>PF {{ money(row.pfDeduction) }} / {{ money(row.pfEmployerContribution) }}</div>
                    <small>ESI {{ money(row.esiDeduction) }} / {{ money(row.esiEmployerContribution) }}</small>
                  </td>
                  <td class="num">
                    <div>PT {{ money(row.ptDeduction) }}</div>
                    <small>LWF {{ money(row.lwfEmployeeDeduction) }} / {{ money(row.lwfEmployerContribution) }}</small>
                  </td>
                  <td class="num">{{ money(row.netSalary) }}</td>
                  <td>
                    <span class="pill" [class.ok]="row.matchStatus === 'MATCHED'">{{ row.matchStatus || '-' }}</span>
                    @if (row.mismatchReason) {
                      <small class="reason">{{ row.mismatchReason }}</small>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="11" class="empty">No generated payroll rows found for this period.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1500px; margin: 0 auto; color: #0f172a; }
    .hero { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 4px; text-transform: uppercase; letter-spacing: .12em; color: #64748b; font-size: 12px; font-weight: 800; }
    h1 { margin: 0; font-size: 28px; line-height: 1.15; }
    .subtitle { margin: 8px 0 0; color: #64748b; max-width: 780px; }
    .btn { border: 0; border-radius: 10px; padding: 10px 14px; background: #0f172a; color: #fff; font-weight: 800; cursor: pointer; }
    .btn.secondary { background: #e2e8f0; color: #0f172a; align-self: end; }
    .btn:disabled { opacity: .6; cursor: not-allowed; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; padding: 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; margin-bottom: 14px; }
    label { display: grid; gap: 6px; font-size: 12px; font-weight: 800; color: #475569; }
    input, select { min-width: 190px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 10px; background: #fff; }
    .summary { display: grid; grid-template-columns: repeat(5, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .summary div { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; }
    .summary strong { display: block; font-size: 20px; }
    .summary span, small { color: #64748b; font-size: 12px; }
    .table-card { overflow: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; min-width: 1180px; }
    th, td { padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    td strong, td small { display: block; }
    .num { text-align: right; }
    .pill { display: inline-flex; border-radius: 999px; padding: 4px 8px; background: #fee2e2; color: #991b1b; font-size: 11px; font-weight: 900; }
    .pill.ok { background: #dcfce7; color: #166534; }
    .reason { margin-top: 6px; color: #b45309; max-width: 260px; white-space: normal; }
    .state { padding: 18px; border: 1px dashed #cbd5e1; border-radius: 14px; color: #64748b; background: #fff; }
    .state.error { border-color: #fecaca; color: #991b1b; background: #fef2f2; }
    .empty { text-align: center; color: #64748b; padding: 30px; }
    @media (max-width: 900px) { .hero { display: block; } .summary { grid-template-columns: 1fr; } }
  `],
})
export class ContractorPayrollComputationPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly loadRequests$ = new Subject<void>();
  private readonly pageSize = 500;
  private destroyed = false;

  portal: Portal = 'client';
  rows: any[] = [];
  loading = false;
  error = '';
  periodMonth = new Date().toISOString().slice(0, 7);
  matchStatus = '';
  clientId = '';

  constructor(
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.portal = (this.route.snapshot.data['portal'] || 'client') as Portal;
    this.clientId = this.route.snapshot.queryParamMap.get('clientId') || '';
    this.loadRequests$
      .pipe(
        switchMap(() => this.loadRows()),
        takeUntil(this.destroy$),
      )
      .subscribe(({ rows, error }) => {
        this.updateView(() => {
          this.rows = rows;
          this.error = error || '';
        });
      });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  get title(): string {
    if (this.portal === 'contractor') return 'My Generated Payroll';
    if (this.portal === 'branch') return 'Contractor Payroll Review';
    if (this.portal === 'auditor') return 'Contractor Payroll Audit View';
    return 'Contractor Payroll Computation';
  }

  get needsClientFilter(): boolean {
    return this.portal === 'auditor';
  }

  get exceptionCount(): number {
    return this.rows.filter((row) => row.matchStatus !== 'MATCHED').length;
  }

  load(): void {
    this.loadRequests$.next();
  }

  private loadRows(): Observable<LoadResult> {
    if (this.needsClientFilter && !this.clientId.trim()) {
      return of({
        rows: [],
        error: 'Enter a client ID to load auditor-scoped contractor payroll rows.',
      });
    }
    const params: Record<string, string> = {};
    if (this.periodMonth) params['periodMonth'] = this.periodMonth;
    if (this.matchStatus) params['matchStatus'] = this.matchStatus;
    if (this.clientId.trim()) params['clientId'] = this.clientId.trim();

    this.loading = true;
    this.error = '';
    return this.fetchAllRows(params).pipe(
      map((rows) => ({ rows })),
      catchError((err) =>
        of({
          rows: [],
          error: err?.error?.message || 'Could not load contractor payroll computation rows.',
        }),
      ),
      finalize(() =>
        this.updateView(() => {
          this.loading = false;
        }),
      ),
    );
  }

  private fetchAllRows(params: Record<string, string>): Observable<any[]> {
    return this.fetchPage(params, 0).pipe(
      expand((page) => {
        const nextOffset = page.offset + page.data.length;
        const hasMore = page.data.length === page.limit && nextOffset < page.total;
        return hasMore ? this.fetchPage(params, nextOffset) : EMPTY;
      }),
      reduce((rows, page) => rows.concat(page.data), [] as any[]),
    );
  }

  private fetchPage(params: Record<string, string>, offset: number): Observable<ComputationPage> {
    return this.http
      .get<any>(this.endpoint, {
        params: {
          ...params,
          limit: String(this.pageSize),
          offset: String(offset),
        },
      })
      .pipe(
        // Bound each page independently. Completed 500-row pages remain useful
        // progress and do not consume the timeout budget of later pages.
        timeout(20000),
        retry(1),
        map((res) => {
          const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          return {
            data,
            total: this.toNumber(res?.total ?? offset + data.length),
            limit: this.toNumber(res?.limit ?? this.pageSize) || this.pageSize,
            offset: this.toNumber(res?.offset ?? offset),
          };
        }),
      );
  }

  total(key: string): number {
    return this.rows.reduce((sum, row) => sum + this.toNumber(row[key]), 0);
  }

  money(value: unknown): string {
    const amount = this.toNumber(value);
    return amount.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: amount % 1 ? 2 : 0,
    });
  }

  private get endpoint(): string {
    if (this.portal === 'contractor') {
      return '/api/v1/contractor/computation/mcd-computations';
    }
    return '/api/v1/client/contractor-computation/mcd-computations';
  }

  private toNumber(value: unknown): number {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  private updateView(update: () => void): void {
    if (this.destroyed) return;
    this.zone.run(() => {
      update();
      this.cdr.markForCheck();
    });
  }
}
