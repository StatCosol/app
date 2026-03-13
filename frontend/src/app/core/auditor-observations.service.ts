import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditorObservationsService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  listCategories(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/auditor/observations/categories`);
  }

  list(auditId?: string | null): Observable<any> {
    let params = new HttpParams();
    if (auditId) params = params.set('auditId', auditId);
    return this.http.get(`${this.baseUrl}/api/v1/auditor/observations`, { params });
  }

  getOne(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/auditor/observations/${id}`);
  }

  create(data: {
    auditId: string;
    categoryId?: string;
    observation: string;
    consequences?: string;
    complianceRequirements?: string;
    elaboration?: string;
    clause?: string;
    recommendation?: string;
    risk?: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/auditor/observations`, data);
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/auditor/observations/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/auditor/observations/${id}`);
  }

  verifyObservationClosure(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/auditor/observations/${id}/verify`, {
      remarks: remarks || undefined,
    });
  }

  reopenObservation(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/auditor/observations/${id}/reopen`, {
      remarks: remarks || undefined,
    });
  }

  exportAuditObservationsPdf(auditId: string): Observable<Blob> {
    return this.http.get(
      `${this.baseUrl}/api/v1/auditor/observations/audit/${auditId}/export`,
      { responseType: 'blob' },
    );
  }
}
