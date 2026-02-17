import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminApprovalsService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(status?: string): Observable<any> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get(`${this.baseUrl}/api/admin/approvals`, { params });
  }

  getCounts(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/admin/approvals/counts`);
  }

  approve(id: string, notes: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/admin/approvals/${id}/approve`, { notes });
  }

  reject(id: string, notes: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/admin/approvals/${id}/reject`, { notes });
  }
}
