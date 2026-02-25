import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, map } from 'rxjs';

export type PayrollRunSummary = {
  id: string;
  clientId: string;
  clientName?: string | null;
  periodYear: number;
  periodMonth: number;
  status: string;
  employeeCount?: number | null;
};

export type PayrollRunEmployeeRow = {
  employeeId: string;
  empCode?: string | null;
  employeeName?: string | null;
  grossEarnings?: number | null;
  totalDeductions?: number | null;
  netPay?: number | null;
};

@Injectable({ providedIn: 'root' })
export class PayrollRunsService {
  private base = `${environment.apiBaseUrl}/api/v1/payroll`;

  constructor(private http: HttpClient) {}

  /**
   * Expected backend: GET /api/payroll/runs?clientId&periodYear&periodMonth&status
   * Should return { data: [], total } or []
   */
  listRuns(q: {
    clientId?: string;
    periodYear?: number;
    periodMonth?: number;
    status?: string;
  }): Observable<PayrollRunSummary[]> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.periodYear) p = p.set('periodYear', String(q.periodYear));
    if (q.periodMonth) p = p.set('periodMonth', String(q.periodMonth));
    if (q.status) p = p.set('status', q.status);

    return this.http.get<any>(`${this.base}/runs`, { params: p }).pipe(
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return (arr || []).map((r: any) => ({
          id: String(r?.id ?? ''),
          clientId: String(r?.clientId ?? r?.client_id ?? ''),
          clientName: r?.clientName ?? r?.client_name ?? null,
          periodYear: Number(r?.periodYear ?? r?.period_year ?? 0),
          periodMonth: Number(r?.periodMonth ?? r?.period_month ?? 0),
          status: String(r?.status ?? 'DRAFT'),
          employeeCount: r?.employeeCount ?? r?.employee_count ?? null,
        })) as PayrollRunSummary[];
      }),
    );
  }

  /**
   * Expected backend: GET /api/payroll/runs/:runId/employees
   */
  listRunEmployees(runId: string): Observable<PayrollRunEmployeeRow[]> {
    return this.http.get<any>(`${this.base}/runs/${runId}/employees`).pipe(
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return (arr || []).map((r: any) => ({
          employeeId: String(r?.employeeId ?? r?.employee_id ?? r?.id ?? ''),
          empCode: r?.empCode ?? r?.employeeCode ?? r?.emp_code ?? null,
          employeeName: r?.employeeName ?? r?.name ?? r?.fullName ?? null,
          grossEarnings: r?.grossEarnings ?? r?.gross_earnings ?? null,
          totalDeductions: r?.totalDeductions ?? r?.total_deductions ?? null,
          netPay: r?.netPay ?? r?.net_pay ?? null,
        })) as PayrollRunEmployeeRow[];
      }),
    );
  }

  /** PDF (generated) */
  downloadPayslipPdf(runId: string, empId: string): Observable<Blob> {
    return this.http.get(`${this.base}/runs/${runId}/employees/${empId}/payslip.pdf`, {
      responseType: 'blob',
    });
  }

  /** PDF (archived) */
  downloadArchivedPayslipPdf(runId: string, empId: string): Observable<Blob> {
    return this.http.get(`${this.base}/runs/${runId}/employees/${empId}/payslip.archived.pdf`, {
      responseType: 'blob',
    });
  }

  /** ZIP for the run */
  downloadPayslipsZip(runId: string): Observable<Blob> {
    return this.http.get(`${this.base}/runs/${runId}/payslips.zip`, { responseType: 'blob' });
  }

  /** Generate & archive payslips for run */
  archiveRunPayslips(runId: string) {
    return this.http.post(`${this.base}/runs/${runId}/payslips/archive`, {});
  }

  /** Create a new payroll run */
  createRun(payload: {
    clientId: string;
    periodYear: number;
    periodMonth: number;
    title?: string;
    branchId?: string | null;
    sourcePayrollInputId?: string | null;
  }) {
    return this.http.post(`${this.base}/runs`, payload);
  }

  /** Upload employees sheet for a run */
  uploadRunEmployeesFile(runId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.base}/runs/${runId}/employees/upload`, formData);
  }

  /** Client-side helper for saving blobs */
  saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
