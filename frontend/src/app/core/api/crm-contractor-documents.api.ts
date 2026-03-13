import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CrmContractorDocumentsApi {
  constructor(private http: HttpClient) {}

  /** Work-queue KPI chip counts */
  kpis(): Observable<any> {
    return this.http.get('/api/v1/crm/contractor-documents/kpis');
  }

  list(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get('/api/v1/crm/contractor-documents', { params: p });
  }

  review(id: string, payload: { status: string; reviewNotes?: string }): Observable<any> {
    return this.http.post(`/api/v1/crm/contractor-documents/${id}/review`, payload);
  }
}
