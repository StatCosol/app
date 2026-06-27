import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type PayrollStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type AttendanceSource = 'UPLOAD' | 'KIOSK' | 'MIXED' | 'NONE';

export interface PayrollSheet {
  id: string;
  clientId: string;
  branchId: string | null;
  month: number;
  year: number;
  status: PayrollStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollSheetRow {
  id: string;
  sheetId: string;
  contractorEmployeeId: string;
  employeeName: string;
  designation: string | null;
  monthlyGross: number;
  basicDaPct: number;
  workedDays: number;
  dailyRate: number;
  earnedGross: number;
  pfBasis: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  netPay: number;
  ctc: number;
  attendanceSource: AttendanceSource;
}

export interface SheetWithRows {
  sheet: PayrollSheet | null;
  rows: PayrollSheetRow[];
}

export interface AttendanceUploadResult {
  uploadId: string;
  rowsProcessed: number;
}

@Injectable({ providedIn: 'root' })
export class ContractorPayrollApiService {
  private base = '/api/v1/contractor-payroll';

  constructor(private http: HttpClient) {}

  downloadTemplate(month: number, year: number, branchId?: string): void {
    let params = new HttpParams().set('month', month).set('year', year);
    if (branchId) params = params.set('branchId', branchId);
    const url = `${this.base}/attendance/template?${params.toString()}`;
    window.open(url, '_blank');
  }

  uploadAttendance(
    file: File,
    month: number,
    year: number,
    branchId?: string,
  ): Observable<AttendanceUploadResult> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('month', String(month));
    fd.append('year', String(year));
    if (branchId) fd.append('branchId', branchId);
    return this.http.post<AttendanceUploadResult>(`${this.base}/attendance/upload`, fd);
  }

  generateSheet(month: number, year: number, branchId?: string): Observable<PayrollSheet> {
    return this.http.post<PayrollSheet>(`${this.base}/sheet/generate`, {
      month,
      year,
      branchId,
    });
  }

  getSheet(month: number, year: number, branchId?: string): Observable<SheetWithRows> {
    let params = new HttpParams().set('month', month).set('year', year);
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<SheetWithRows>(`${this.base}/sheet`, { params });
  }

  listSheets(year?: number, branchIds?: string[]): Observable<PayrollSheet[]> {
    let params = new HttpParams();
    if (year) params = params.set('year', year);
    if (branchIds?.length) params = params.set('branchIds', branchIds.join(','));
    return this.http.get<PayrollSheet[]>(`${this.base}/sheets`, { params });
  }

  submitSheet(id: string): Observable<PayrollSheet> {
    return this.http.post<PayrollSheet>(`${this.base}/sheet/${id}/submit`, {});
  }

  approveSheet(id: string, note?: string): Observable<PayrollSheet> {
    return this.http.post<PayrollSheet>(`${this.base}/sheet/${id}/approve`, { note });
  }

  rejectSheet(id: string, note: string): Observable<PayrollSheet> {
    return this.http.post<PayrollSheet>(`${this.base}/sheet/${id}/reject`, { note });
  }

  exportSheet(id: string): void {
    window.open(`${this.base}/sheet/${id}/export`, '_blank');
  }
}
