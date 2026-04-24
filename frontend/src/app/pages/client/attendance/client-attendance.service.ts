import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEK_OFF';
  checkIn?: string;
  checkOut?: string;
  workedHours?: number;
  overtimeHours?: number;
  remarks?: string;
}

export interface AttendanceSummary {
  employeeId: string;
  employeeCode: string;
  employeeName?: string;
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  holiday: number;
  weekOff: number;
  totalDays: number;
}

export interface AttendanceMismatch {
  key: string;
  employeeId: string;
  employeeCode: string;
  date: string;
  issue: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM';
  resolved: boolean;
}

@Injectable({ providedIn: 'root' })
export class ClientAttendanceService {
  private base = `${environment.apiBaseUrl}/api/v1/client/attendance`;

  constructor(private http: HttpClient) {}

  mark(body: { employeeId: string; date: string; status: string; checkIn?: string; checkOut?: string; remarks?: string }): Observable<any> {
    return this.http.post(`${this.base}/mark`, body);
  }

  bulkMark(body: { date: string; entries: { employeeId: string; status: string }[] }): Observable<any> {
    return this.http.post(`${this.base}/bulk`, body);
  }

  list(q: { from: string; to: string; branchId?: string; employeeId?: string }): Observable<AttendanceRecord[]> {
    let p = new HttpParams().set('from', q.from).set('to', q.to);
    if (q.branchId) p = p.set('branchId', q.branchId);
    if (q.employeeId) p = p.set('employeeId', q.employeeId);
    return this.http.get<any>(this.base, { params: p }).pipe(
      map(res => Array.isArray(res) ? res : res?.data ?? []),
    );
  }

  summary(year: number, month: number, branchId?: string): Observable<AttendanceSummary[]> {
    let p = new HttpParams().set('year', String(year)).set('month', String(month));
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get<any>(`${this.base}/summary`, { params: p }).pipe(
      map(res => Array.isArray(res) ? res : res?.data ?? []),
    );
  }

  mismatches(year: number, month: number, branchId?: string): Observable<AttendanceMismatch[]> {
    let p = new HttpParams().set('year', String(year)).set('month', String(month));
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get<any>(`${this.base}/mismatches`, { params: p }).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? [])),
    );
  }

  lopPreview(year: number, month: number, branchId?: string): Observable<AttendanceSummary[]> {
    let p = new HttpParams().set('year', String(year)).set('month', String(month));
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get<any>(`${this.base}/lop-preview`, { params: p }).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? [])),
    );
  }

  seedDefaults(body: { year: number; month: number; branchId?: string; weeklyOffDays?: number[] }): Observable<any> {
    return this.http.post(`${this.base}/seed-defaults`, body);
  }

  // ── Daily Attendance Management ────────────────────────────
  listDaily(date: string, branchId?: string, approvalStatus?: string): Observable<DailyAttendanceRecord[]> {
    let p = new HttpParams().set('date', date);
    if (branchId) p = p.set('branchId', branchId);
    if (approvalStatus) p = p.set('approvalStatus', approvalStatus);
    return this.http.get<any>(`${this.base}/daily`, { params: p }).pipe(
      map(res => Array.isArray(res) ? res : res?.data ?? []),
    );
  }

  getApprovalStats(date: string, branchId?: string): Observable<ApprovalStats> {
    let p = new HttpParams().set('date', date);
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get<ApprovalStats>(`${this.base}/daily/stats`, { params: p });
  }

  editRecord(id: string, body: {
    status: string;
    checkIn?: string;
    checkOut?: string;
    workedHours?: number;
    overtimeHours?: number;
    remarks?: string;
  }): Observable<any> {
    return this.http.put(`${this.base}/${id}`, body);
  }

  approveRecords(ids: string[]): Observable<{ approved: number }> {
    return this.http.post<{ approved: number }>(`${this.base}/approve`, { ids });
  }

  rejectRecords(ids: string[], reason?: string): Observable<{ rejected: number }> {
    return this.http.post<{ rejected: number }>(`${this.base}/reject`, { ids, reason });
  }
}

export interface DailyAttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workedHours: string | null;
  overtimeHours: string | null;
  remarks: string | null;
  source: string;
  captureMethod: string;
  selfMarked: boolean;
  shortWorkReason: string | null;
  approvalStatus: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
}

export interface ApprovalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}
