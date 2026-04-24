import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClientVisibilityService {
  private base = `${environment.apiBaseUrl}/api/v1/client/visibility`;

  constructor(private http: HttpClient) {}

  getReturnsSummary(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/returns-summary`);
  }

  getRenewals(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/renewals`);
  }

  getComplianceCalendar(month?: number, year?: number): Observable<any[]> {
    let p = new HttpParams();
    if (month) p = p.set('month', month.toString());
    if (year) p = p.set('year', year.toString());
    return this.http.get<any[]>(`${this.base}/calendar`, { params: p });
  }

  getReminders(days?: number, branchId?: string): Observable<any[]> {
    let p = new HttpParams();
    if (days) p = p.set('days', days.toString());
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get<any[]>(`${this.base}/reminders`, { params: p });
  }
}
