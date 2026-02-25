import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditsService {
  private baseUrl = environment.apiBaseUrl;
  private crmBase = `${this.baseUrl}/api/v1/crm/audits`;
  private auditorBase = `${this.baseUrl}/api/v1/auditor/audits`;

  constructor(private http: HttpClient) {}

  // CRM: create/schedule an audit
  crmCreateAudit(payload: any): Observable<any> {
    return this.http.post(this.crmBase, payload);
  }

  // Auditor: list assigned audits with optional filters
  auditorListAudits(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(this.auditorBase, { params: p });
  }

  // Auditor: get single audit detail
  auditorGetAudit(id: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${id}`);
  }
}
