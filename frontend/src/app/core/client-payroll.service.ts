import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ClientPayrollService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  // Payroll Inputs
  listInputs(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/payroll/inputs`, { params });
  }

  createInput(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/client/payroll/inputs`, data);
  }

  listRuns(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/payroll/runs`, { params });
  }

  updateInputStatus(id: string, data: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/client/payroll/inputs/${id}/status`, data);
  }

  /** Client payroll summary — returns basic stats from client-scoped inputs.
   *  Note: /api/payroll/summary is PAYROLL/ADMIN only. For CLIENT users
   *  we derive a lightweight summary from the inputs list. */
  getSummary(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/payroll/inputs`, { params: { limit: '1' } }).pipe(
      map((res: any) => ({
        totalRuns: res?.total || 0,
        activeEmployees: 0,
        pendingInputs: res?.pending || 0,
      })),
    );
  }

  getStatusHistory(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/payroll/inputs/${id}/status-history`);
  }

  uploadInputFile(id: string, file: File, data?: any): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (data) {
      Object.keys(data).forEach(k => formData.append(k, data[k]));
    }
    return this.http.post(`${this.baseUrl}/api/v1/client/payroll/inputs/${id}/files`, formData);
  }

  listInputFiles(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/payroll/inputs/${id}/files`);
  }

  downloadInputFileUrl(id: string): string {
    return `${this.baseUrl}/api/v1/client/payroll/inputs/files/${id}/download`;
  }

  // Registers & Records
  listRegisters(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/payroll/registers-records`, { params });
  }

  uploadRegister(file: File, data: any): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    Object.keys(data).forEach(k => formData.append(k, data[k]));
    return this.http.post(`${this.baseUrl}/api/v1/client/payroll/registers-records`, formData);
  }

  downloadRegister(id: string): string {
    return `${this.baseUrl}/api/v1/client/payroll/registers-records/${id}/download`;
  }

  listEmployeeRecords(filters?: {
    periodYear?: number;
    periodMonth?: number;
    branchId?: string;
    search?: string;
  }): Observable<EmployeePayrollRecordsResponse> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach((key) => {
        const value = (filters as Record<string, unknown>)[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, String(value));
        }
      });
    }
    return this.http.get<EmployeePayrollRecordsResponse>(
      `${this.baseUrl}/api/v1/client/payroll/employee-records`,
      { params },
    );
  }

  payslipFileUrl(runId: string, employeeCode: string): string {
    const params = new HttpParams()
      .set('runId', runId)
      .set('employeeCode', employeeCode);
    return `${this.baseUrl}/api/v1/client/payroll/payslips/file?${params.toString()}`;
  }

  payslipPackUrl(filters: {
    periodYear: number;
    periodMonth: number;
    branchId?: string;
  }): string {
    let params = new HttpParams()
      .set('periodYear', String(filters.periodYear))
      .set('periodMonth', String(filters.periodMonth));
    if (filters.branchId) params = params.set('branchId', filters.branchId);
    return `${this.baseUrl}/api/v1/client/payroll/payslips/pack?${params.toString()}`;
  }

  fnfDocumentUrl(fnfId: string, docType: 'SETTLEMENT_STATEMENT' | 'RELIEVING_LETTER'): string {
    return `${this.baseUrl}/api/v1/client/payroll/fnf/${encodeURIComponent(fnfId)}/documents/${docType}`;
  }
}

export interface EmployeePayrollRecord {
  employeeId: string | null;
  employeeCode: string;
  employeeName: string;
  branchId: string | null;
  runId: string | null;
  runStatus: string | null;
  payslipAvailable: boolean;
  fnfId: string | null;
  fnfStatus: string | null;
  settlementAvailable: boolean;
  relievingAvailable: boolean;
}

export interface EmployeePayrollRecordsResponse {
  periodYear: number | null;
  periodMonth: number | null;
  records: EmployeePayrollRecord[];
  bulkPayslipAvailable: boolean;
}
