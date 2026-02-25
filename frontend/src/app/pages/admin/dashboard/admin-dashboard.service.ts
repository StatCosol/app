import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AdminStatsDto,
  AdminDashboardSummaryDto,
  TaskStatusDto,
  LoadRowDto,
  AttentionItemDto,
  SlaTrendDto
} from './admin-dashboard.dto';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly base = '/api/v1/admin/dashboard';

  constructor(private http: HttpClient) {}

  getStats(range: '7d' | '30d' | '90d'): Observable<AdminStatsDto> {
    return this.http.get<AdminStatsDto>(`${this.base}/stats`, { params: { range } });
  }

  getSummary(params?: Record<string, string>): Observable<AdminDashboardSummaryDto> {
    return this.http.get<AdminDashboardSummaryDto>(`${this.base}/summary`, { params });
  }

  getClientsMinimal(): Observable<Array<{ id: string; name: string }>> {
    return this.http.get<Array<{ id: string; name: string }>>(`${this.base}/clients-minimal`);
  }

  sendDigestNow(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`/api/v1/admin/reminders/send-now`, {});
  }

  sendCriticalAlertsNow(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`/api/v1/admin/reminders/send-critical`, {});
  }

  getTaskStatus(range: '7d' | '30d' | '90d'): Observable<TaskStatusDto> {
    return this.http.get<TaskStatusDto>(`${this.base}/task-status`, { params: { range } });
  }

  getSlaTrend(range: '7d' | '30d' | '90d'): Observable<SlaTrendDto> {
    return this.http.get<SlaTrendDto>(`${this.base}/sla-trend`, { params: { range } });
  }

  getCrmLoad(): Observable<LoadRowDto[]> {
    return this.http.get<LoadRowDto[]>(`${this.base}/crm-load`);
  }

  getAuditorLoad(): Observable<LoadRowDto[]> {
    return this.http.get<LoadRowDto[]>(`${this.base}/auditor-load`);
  }

  getAttention(range: '7d' | '30d' | '90d'): Observable<AttentionItemDto[]> {
    return this.http.get<AttentionItemDto[]>(`${this.base}/attention`, { params: { range } });
  }

  getAvailableStates(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/states`);
  }
}
