import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import {
  PayrollApiService,
  PayrollClient,
  PfEsiChallanRow,
  PfEsiGapRow,
  PfEsiRemittanceRow,
  PfEsiSummaryResponse,
} from './payroll-api.service';
import { ToastService } from '../../shared/toast/toast.service';

type SchemeFilter = 'ALL' | 'PF' | 'ESI';
type RemittanceFilter = 'ALL' | 'READY' | 'IN_PROGRESS' | 'NOT_STARTED' | 'REWORK' | 'UNKNOWN';
type IdentifierFilter = 'ALL' | 'MISSING_ID' | 'HAS_ID';

@Component({
  selector: 'app-payroll-pf-esi',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payroll-pf-esi.component.html',
  styleUrls: ['./payroll-pf-esi.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollPfEsiComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  refreshing = false;
  error = '';

  clients: PayrollClient[] = [];
  selectedClientId = '';
  selectedYear = new Date().getFullYear();
  selectedMonth = 0;

  summary: PfEsiSummaryResponse | null = null;
  gapRows: PfEsiGapRow[] = [];
  remittanceRows: PfEsiRemittanceRow[] = [];
  challanRows: PfEsiChallanRow[] = [];

  schemeFilter: SchemeFilter = 'ALL';
  identifierFilter: IdentifierFilter = 'ALL';
  remittanceFilter: RemittanceFilter = 'ALL';
  gapSearch = '';
  downloadBusyId = '';

  selectedException: PfEsiGapRow | null = null;
  showExceptionDrawer = false;

  readonly monthOptions = [
    { value: 0, label: 'All months' },
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  readonly yearOptions = this.buildYearOptions();

  constructor(
    private readonly payrollApi: PayrollApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBase();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredGapRows(): PfEsiGapRow[] {
    const q = this.gapSearch.trim().toLowerCase();
    return this.gapRows.filter((row) => {
      if (this.schemeFilter !== 'ALL' && row.scheme !== this.schemeFilter) return false;
      if (this.identifierFilter === 'MISSING_ID' && this.hasIdentifier(row)) return false;
      if (this.identifierFilter === 'HAS_ID' && !this.hasIdentifier(row)) return false;
      if (!q) return true;
      const blob = `${row.clientName} ${row.empCode} ${row.name}`.toLowerCase();
      return blob.includes(q);
    });
  }

  get filteredRemittanceRows(): PfEsiRemittanceRow[] {
    return this.remittanceRows.filter((row) => {
      if (this.remittanceFilter !== 'ALL' && row.remittanceState !== this.remittanceFilter) return false;
      return true;
    });
  }

  get pfApplicableCount(): number {
    return this.selectedSummaryClients.reduce((sum, c) => sum + c.pf.registered + c.pf.pending, 0);
  }

  get pfRegisteredCount(): number {
    return this.selectedSummaryClients.reduce((sum, c) => sum + c.pf.registered, 0);
  }

  get pfPendingCount(): number {
    return this.selectedSummaryClients.reduce((sum, c) => sum + c.pf.pending, 0);
  }

  get esiApplicableCount(): number {
    return this.selectedSummaryClients.reduce((sum, c) => sum + c.esi.registered + c.esi.pending, 0);
  }

  get esiRegisteredCount(): number {
    return this.selectedSummaryClients.reduce((sum, c) => sum + c.esi.registered, 0);
  }

  get esiPendingCount(): number {
    return this.selectedSummaryClients.reduce((sum, c) => sum + c.esi.pending, 0);
  }

  get pfCoveragePercent(): number {
    return this.percent(this.pfRegisteredCount, this.pfApplicableCount);
  }

  get esiCoveragePercent(): number {
    return this.percent(this.esiRegisteredCount, this.esiApplicableCount);
  }

  get selectedClientName(): string {
    if (!this.selectedClientId) return 'All assigned clients';
    return this.clients.find((c) => c.id === this.selectedClientId)?.name || 'Selected client';
  }

  get missingIdentifierCount(): number {
    return this.gapRows.filter((row) => !this.hasIdentifier(row)).length;
  }

  get highAgingCount(): number {
    return this.gapRows.filter((row) => Number(row.pendingDays || 0) > 30).length;
  }

  get remittanceReadyCount(): number {
    return this.remittanceRows.filter((row) => row.remittanceState === 'READY').length;
  }

  get remittanceInProgressCount(): number {
    return this.remittanceRows.filter((row) => row.remittanceState === 'IN_PROGRESS').length;
  }

  get remittanceReworkCount(): number {
    return this.remittanceRows.filter((row) => row.remittanceState === 'REWORK').length;
  }

  get remittanceDerivedText(): string {
    return 'Remittance state is derived from payroll run lifecycle until dedicated remittance APIs are exposed.';
  }

  trackGap(_: number, row: PfEsiGapRow): string {
    return `${row.scheme}-${row.employeeId}`;
  }

  trackRemittance(_: number, row: PfEsiRemittanceRow): string {
    return row.runId;
  }

  trackChallan(_: number, row: PfEsiChallanRow): string {
    return row.id;
  }

  onClientOrPeriodChange(): void {
    this.reloadBoards();
  }

  refresh(): void {
    this.reloadBoards(true);
  }

  openException(row: PfEsiGapRow): void {
    this.selectedException = row;
    this.showExceptionDrawer = true;
  }

  closeExceptionDrawer(): void {
    this.showExceptionDrawer = false;
    this.selectedException = null;
  }

  remittanceStateClass(state: PfEsiRemittanceRow['remittanceState']): string {
    if (state === 'READY') return 'badge badge--good';
    if (state === 'IN_PROGRESS') return 'badge badge--info';
    if (state === 'NOT_STARTED') return 'badge badge--muted';
    if (state === 'REWORK') return 'badge badge--bad';
    return 'badge badge--warn';
  }

  approvalClass(status: string): string {
    const value = String(status || '').toUpperCase();
    if (value === 'APPROVED') return 'badge badge--good';
    if (value === 'REJECTED') return 'badge badge--bad';
    return 'badge badge--warn';
  }

  pendingClass(days: number): string {
    if (days > 30) return 'days days--critical';
    if (days > 7) return 'days days--warn';
    return 'days';
  }

  statusHint(row: PfEsiGapRow): string {
    if (row.scheme === 'PF') {
      return row.uanAvailable ? 'UAN available' : 'UAN missing';
    }
    return row.ipNumberAvailable ? 'IP number available' : 'IP number missing';
  }

  schemeClass(scheme: PfEsiGapRow['scheme'] | PfEsiChallanRow['scheme']): string {
    if (scheme === 'PF') return 'badge badge--info';
    if (scheme === 'ESI') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  monthYearLabel(year: number | null, month: number | null): string {
    if (!year || !month || month < 1 || month > 12) return '-';
    return `${this.monthOptions[month].label} ${year}`;
  }

  formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  downloadLabel(row: PfEsiChallanRow): string {
    if (!row.id) return 'Not available';
    if (this.downloadBusyId === row.id) return 'Downloading...';
    return 'Download';
  }

  downloadChallan(row: PfEsiChallanRow): void {
    if (!row.id || this.downloadBusyId) return;
    this.downloadBusyId = row.id;
    const fallbackName = `${row.scheme.toLowerCase()}-${row.periodYear || 'na'}-${row.periodMonth || 'na'}-${row.id}.pdf`;
    this.payrollApi
      .downloadPfEsiChallan(row.id, fallbackName)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.downloadBusyId = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => this.toast.success('Download started'),
        error: (err) => this.toast.error(err?.error?.message || 'Download failed'),
      });
  }

  loadBase(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      clients: this.payrollApi.getAssignedClients().pipe(catchError(() => of([] as PayrollClient[]))),
      summary: this.payrollApi.getPfEsiSummary(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ clients, summary }) => {
          this.clients = clients || [];
          this.summary = summary || null;

          if (this.selectedClientId && !this.clients.find((c) => c.id === this.selectedClientId)) {
            this.selectedClientId = '';
          }

          this.reloadBoards();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load PF/ESI dashboard';
          this.toast.error(this.error);
        },
      });
  }

  private reloadBoards(showToast = false): void {
    this.refreshing = true;

    forkJoin({
      gaps: this.payrollApi.getPfEsiGaps(this.selectedClientId || undefined).pipe(catchError(() => of([] as PfEsiGapRow[]))),
      remittances: this.payrollApi
        .getPfEsiRemittances({
          clientId: this.selectedClientId || undefined,
          periodYear: this.selectedYear || undefined,
          periodMonth: this.selectedMonth || undefined,
        })
        .pipe(catchError(() => of([] as PfEsiRemittanceRow[]))),
      challans: this.payrollApi
        .getPfEsiChallans({
          clientId: this.selectedClientId || undefined,
          periodYear: this.selectedYear || undefined,
          periodMonth: this.selectedMonth || undefined,
        })
        .pipe(catchError(() => of([] as PfEsiChallanRow[]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.refreshing = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ gaps, remittances, challans }) => {
          this.gapRows = (gaps || []).sort((a, b) => Number(b.pendingDays || 0) - Number(a.pendingDays || 0));
          this.remittanceRows = (remittances || [])
            .map((row) => ({ ...row, clientName: row.clientName || this.clientNameFor(row.clientId) }))
            .sort((a, b) => this.periodSort(b.periodYear, b.periodMonth) - this.periodSort(a.periodYear, a.periodMonth));
          this.challanRows = (challans || []).map((row) => ({
            ...row,
            clientName: row.clientName || this.clientNameFor(row.clientId),
          }));

          if (showToast) this.toast.success('PF/ESI dashboard refreshed');
        },
        error: () => {
          if (showToast) this.toast.error('Refresh failed');
        },
      });
  }

  private get selectedSummaryClients(): PfEsiSummaryResponse['clients'] {
    if (!this.summary) return [];
    if (!this.selectedClientId) return this.summary.clients || [];
    return (this.summary.clients || []).filter((c) => c.clientId === this.selectedClientId);
  }

  private percent(num: number, den: number): number {
    if (!den) return 0;
    return Math.round((num / den) * 100);
  }

  private clientNameFor(clientId: string): string {
    return this.clients.find((c) => c.id === clientId)?.name || 'Unknown client';
  }

  private hasIdentifier(row: PfEsiGapRow): boolean {
    if (row.scheme === 'PF') return !!row.uanAvailable;
    if (row.scheme === 'ESI') return !!row.ipNumberAvailable;
    return false;
  }

  private periodSort(year: number, month: number): number {
    return Number(year || 0) * 100 + Number(month || 0);
  }

  private buildYearOptions(): number[] {
    const year = new Date().getFullYear();
    return [year - 2, year - 1, year, year + 1];
  }
}
