import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  private buildParams(params: any): HttpParams {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') {
        p = p.set(k, String(v));
      }
    });
    return p;
  }

  summary(params: any): Observable<any> {
    const p = this.buildParams(params);
    return this.http.get(`${this.baseUrl}/api/reports/compliance-summary`, { params: p });
  }

  overdue(params: any): Observable<any> {
    const p = this.buildParams(params);
    return this.http.get(`${this.baseUrl}/api/reports/overdue`, { params: p });
  }

  contractorPerf(params: any): Observable<any> {
    const p = this.buildParams(params);
    return this.http.get(`${this.baseUrl}/api/reports/contractor-performance`, { params: p });
  }
}
