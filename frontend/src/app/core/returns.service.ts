import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ClientComplianceSummary,
  ComplianceCalendarItem,
  ReminderNotificationItem,
} from './models/returns.models';

@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  listFilings(filters: any): Observable<any> {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return this.http.get(`${this.baseUrl}/api/v1/client/returns/filings`, { params });
  }

  listTypes(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/returns/types`);
  }

  createFiling(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/client/returns/filings`, payload);
  }

  uploadAck(id: string, file: File, ackNumber?: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    if (ackNumber) form.append('ackNumber', ackNumber);
    return this.http.post(`${this.baseUrl}/api/v1/client/returns/filings/${id}/ack`, form);
  }

  uploadChallan(id: string, file: File): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${this.baseUrl}/api/v1/client/returns/filings/${id}/challan`, form);
  }

  submitFiling(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/client/returns/filings/${id}/submit`, {});
  }

  // ── Client Master visibility endpoints ──

  getClientReturns(clientId: string, branchId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/returns-visibility/${clientId}`, { params });
  }

  getClientExpiryTasks(clientId: string, branchId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/expiry-visibility/${clientId}`, { params });
  }

  getClientComplianceSummary(clientId: string, branchId?: string): Observable<ClientComplianceSummary> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ClientComplianceSummary>(
      `${this.baseUrl}/api/v1/client/compliance-summary/${clientId}`,
      { params },
    );
  }

  getComplianceCalendar(clientId: string, branchId?: string): Observable<ComplianceCalendarItem[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ComplianceCalendarItem[]>(
      `${this.baseUrl}/api/v1/client/compliance-calendar/${clientId}`,
      { params },
    );
  }

  getReminderNotifications(clientId: string, branchId?: string): Observable<ReminderNotificationItem[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ReminderNotificationItem[]>(
      `${this.baseUrl}/api/v1/client/compliance-reminders/${clientId}`,
      { params },
    );
  }
}
