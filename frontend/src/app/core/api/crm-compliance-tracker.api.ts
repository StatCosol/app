import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CrmComplianceTrackerApi {
  constructor(private http: HttpClient) {}

  /* ═══════ MCD Tracker ═══════ */

  /** GET /api/v1/crm/compliance-tracker/mcd */
  getMcd(params: { year?: number; month?: number; clientId?: string } = {}): Observable<any> {
    let hp = new HttpParams();
    if (params.year) hp = hp.set('year', String(params.year));
    if (params.month) hp = hp.set('month', String(params.month));
    if (params.clientId) hp = hp.set('clientId', params.clientId);
    return this.http.get('/api/v1/crm/compliance-tracker/mcd', { params: hp });
  }

  /** POST /api/v1/crm/compliance-tracker/mcd/:branchId/finalize */
  finalizeMcd(branchId: string, year: number, month: number): Observable<any> {
    return this.http.post(`/api/v1/crm/compliance-tracker/mcd/${branchId}/finalize`, { year, month });
  }

  /* ═══════ Audit Closures ═══════ */

  /** GET /api/v1/crm/compliance-tracker/audit-closures */
  getAuditClosures(clientId?: string): Observable<any> {
    let hp = new HttpParams();
    if (clientId) hp = hp.set('clientId', clientId);
    return this.http.get('/api/v1/crm/compliance-tracker/audit-closures', { params: hp });
  }

  /** POST /api/v1/crm/compliance-tracker/audit-closures/:observationId/close */
  closeObservation(observationId: string, notes?: string): Observable<any> {
    return this.http.post(
      `/api/v1/crm/compliance-tracker/audit-closures/${observationId}/close`,
      { notes },
    );
  }
}
