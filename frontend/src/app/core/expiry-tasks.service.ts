import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ExpiryTasksService {
  private base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  // CRM
  crmList(filters?: { status?: string; daysThreshold?: number }): Observable<any[]> {
    let p = new HttpParams();
    if (filters?.status) p = p.set('status', filters.status);
    if (filters?.daysThreshold) p = p.set('daysThreshold', filters.daysThreshold.toString());
    return this.http.get<any[]>(`${this.base}/crm/expiry-tasks`, { params: p });
  }

  crmKpi(): Observable<any> {
    return this.http.get(`${this.base}/crm/expiry-tasks/kpi`);
  }

  crmUpdateStatus(id: string, status: string, notes?: string): Observable<any> {
    return this.http.patch(`${this.base}/crm/expiry-tasks/${id}/status`, { status, notes });
  }

  // Branch
  branchList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/branch/expiry-tasks`);
  }

  // Client
  clientList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/client/expiry-tasks`);
  }

  clientKpi(): Observable<any> {
    return this.http.get(`${this.base}/client/expiry-tasks/kpi`);
  }
}
