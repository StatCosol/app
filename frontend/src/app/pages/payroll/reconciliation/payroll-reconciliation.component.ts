import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth.service';
import { downloadBlob } from '../../../shared/utils/download-blob';

interface Comparison { field: string; expected: string | null; actual: string | null; difference: string | null; state: string }
interface ComparisonRow { employeeCode: string; sourceLine: number | null; status: string; comparisons: Comparison[] }
export interface ReconciliationReport {
  run: { id: string; period: string; status: string; clientId: string; branchId: string | null; updatedAt: string };
  source: { fileName: string; sha256: string }; baselineSha256: string; generatedAt: string; comparedBy: string;
  fields: string[]; uncheckedFields: string[]; note: string; rows: ComparisonRow[];
  totals: { field: string; expected: { amount: string | null; missingValues: number }; actual: { amount: string | null; missingValues: number } }[];
  summary: { payrollEmployees: number; fileEmployees: number; matched: number; mismatched: number; missingInFile: number; extraInFile: number; unverifiable: number };
}

@Component({
  standalone: true, selector: 'app-payroll-reconciliation', imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payroll-reconciliation.component.html', styleUrl: './payroll-reconciliation.component.scss',
})
export class PayrollReconciliationComponent implements OnChanges {
  @Input({ required: true }) runId = '';
  @Input({ required: true }) period = '';
  @Input() runStatus = '';
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private request?: Subscription;
  file: File | null = null;
  readonly result = signal<ReconciliationReport | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  search = '';
  onlyIssues = true;
  page = 0;
  readonly labels: Record<string, string> = { gross_earnings: 'Gross earnings', net_pay: 'Net pay', pf_employee: 'Employee PF', esi_employee: 'Employee ESI' };
  readonly statuses: Record<string, string> = { MATCH: 'Supplied amounts match', MISMATCH: 'Amounts differ', MISSING_IN_FILE: 'Missing in register', EXTRA_IN_FILE: 'Not in payroll', UNVERIFIABLE: 'Amounts need checking' };
  get allowed() { return ['PAYROLL', 'ADMIN'].includes(this.auth.getRoleCode()); }
  get processed() { return ['PROCESSED', 'SUBMITTED', 'APPROVED'].includes(this.runStatus); }
  ngOnChanges() { this.reset(); this.file = null; }
  reset() { this.request?.unsubscribe(); this.result.set(null); this.error.set(''); this.busy.set(false); this.page = 0; }
  selectFile(event: Event) {
    this.reset();
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    if (this.file && (!/\.csv$/i.test(this.file.name) || !this.file.size || this.file.size > 1024 * 1024)) {
      this.file = null; this.error.set('Choose a non-empty CSV file up to 1 MB.');
    }
    // Permit selecting the same file again after editing it or changing runs.
    input.value = '';
  }
  compare() {
    this.reset();
    if (!this.allowed || !this.file || !this.processed) return;
    const form = new FormData(); form.append('file', this.file);
    this.busy.set(true);
    this.request = this.http.post<ReconciliationReport>(`${environment.apiBaseUrl}/api/v1/payroll/runs/${this.runId}/reconcile-register`, form)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: result => { this.result.set(result); this.busy.set(false); },
        error: error => {
          const message = error?.error?.message;
          this.error.set(typeof message === 'string' ? message : 'Could not compare the register. Check the file and your access, then retry.');
          this.busy.set(false);
        },
      });
  }
  async template() {
    const csv = `employee_code,period,gross_earnings,net_pay,pf_employee,esi_employee\r\nREPLACE_WITH_EMPLOYEE_CODE,${this.period},25000.00,23200.00,1800.00,0.00\r\n`;
    try { await downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'wage-register-template.csv'); }
    catch { this.error.set('Could not download the template.'); }
  }
  async download() {
    const result = this.result(); if (!result) return;
    try { await downloadBlob(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }), `payroll-comparison-${result.run.period}-${result.run.id}.json`); }
    catch { this.error.set('Could not download the report.'); }
  }
  filteredRows() {
    const term = this.search.trim().toLowerCase();
    return (this.result()?.rows ?? []).filter(row => (!this.onlyIssues || row.status !== 'MATCH') && row.employeeCode.toLowerCase().includes(term));
  }
  visibleRows() { return this.filteredRows().slice(this.page * 50, (this.page + 1) * 50); }
}
