import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CcoDashboardService {
  private baseUrl = environment.apiBaseUrl;
  private dashboardUrl = `${this.baseUrl}/api/v1/cco/dashboard`;

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<any> {
    return this.http.get(this.dashboardUrl);
  }

  getCrmsUnderMe(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/crms-under-me`);
  }

  getOversight(status?: string): Observable<any[]> {
    let params = new HttpParams();
    if (status && status !== 'ALL') params = params.set('status', status);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/oversight`, { params });
  }

  getOversightDelays(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/oversight/delays`);
  }

  getOversightTrends(months = 6): Observable<any[]> {
    const params = new HttpParams().set('months', String(months));
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/oversight/trends`, { params });
  }

  getCrmsUnderMe(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/crms-under-me`);
  }

  getOversight(status?: string): Observable<any[]> {
    let params = new HttpParams();
    if (status && status !== 'ALL') params = params.set('status', status);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/oversight`, { params });
  }

  getOversightDelays(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/oversight/delays`);
  }

  getOversightTrends(months = 6): Observable<any[]> {
    const params = new HttpParams().set('months', String(months));
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/cco/oversight/trends`, { params });
  }
}
