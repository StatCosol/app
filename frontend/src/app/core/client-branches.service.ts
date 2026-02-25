import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ClientBranchesService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  /** List branches with counts; optional state/status filters */
  list(filters?: { state?: string; status?: string }): Observable<any[]> {
    let params = new HttpParams();
    if (filters?.state) params = params.set('state', filters.state);
    if (filters?.status) params = params.set('status', filters.status);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches`, { params });
  }

  /** Single branch detail with counts */
  getById(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/${id}`);
  }


  /** Create a new branch (MASTER client user only) */
  create(dto: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/client/branches`, dto);
  }


  /* ── Documents ────────────────────────── */

  listDocuments(branchId: string, filters?: Record<string, any>): Observable<any[]> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach((k) => {
        if (filters[k] != null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/documents`, { params });
  }

  uploadDocument(branchId: string, file: File, meta: { category: string; docType: string; periodYear?: number; periodMonth?: number }): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', meta.category);
    fd.append('docType', meta.docType);
    if (meta.periodYear) fd.append('periodYear', String(meta.periodYear));
    if (meta.periodMonth) fd.append('periodMonth', String(meta.periodMonth));
    return this.http.post(`${this.baseUrl}/api/v1/client/branches/${branchId}/documents/upload`, fd);
  }

  reuploadDocument(docId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.put(`${this.baseUrl}/api/v1/client/branches/documents/${docId}/reupload`, fd);
  }

  /* ── MCD ──────────────────────────────── */

  getMcdSchedule(branchId: string, year?: number, month?: number): Observable<any> {
    let params = new HttpParams();
    if (year) params = params.set('year', String(year));
    if (month) params = params.set('month', String(month));
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/${branchId}/mcd`, { params });
  }

  getMcdOverview(branchId: string, months = 6): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/mcd/overview`, {
      params: new HttpParams().set('months', String(months)),
    });
  }

  /* ── Dashboard ────────────────────────── */

  getDashboard(branchId: string, month?: string): Observable<any> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/${branchId}/dashboard`, { params });
  }

  /* ── Registrations ────────────────────── */

  /** List registrations/licenses for a branch */
  listRegistrations(branchId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/registrations`);
  }

  /* ── CRM Registration CRUD ────────────── */

  /** CRM: List registrations for a branch+client */
  crmListRegistrations(branchId: string, clientId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/branch-registrations`, {
      params: new HttpParams().set('branchId', branchId).set('clientId', clientId),
    });
  }

  /** CRM: Create a new registration */
  createRegistration(clientId: string, payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/crm/branch-registrations/for-client/${clientId}`, payload);
  }

  /** CRM: Update a registration */
  updateRegistration(id: string, clientId: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/branch-registrations/${id}/for-client/${clientId}`, payload);
  }

  /** CRM: Delete (soft) a registration */
  deleteRegistration(id: string, clientId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/crm/branch-registrations/${id}/for-client/${clientId}`);
  }

  /** CRM: Upload registration document (or renewal) */
  uploadRegistrationFile(id: string, clientId: string, formData: FormData, field: 'document' | 'renewal' = 'document'): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/api/v1/crm/branch-registrations/${id}/for-client/${clientId}/upload?field=${field}`,
      formData,
    );
  }

  /* ── Registration Summary / Alerts ──────── */

  /** Client-wide registration compliance summary */
  getRegistrationSummary(branchId?: string): Observable<any> {
    if (branchId) {
      return this.http.get(`${this.baseUrl}/api/v1/client/branches/${branchId}/registration-summary`);
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/registration-summary`);
  }

  /** Get registration alerts */
  getRegistrationAlerts(branchId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/registration-alerts`, { params });
  }

  /* ── Audit Observations ────────────────── */

  /** List audit observations for a branch */
  listAuditObservations(branchId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/audit-observations`);
  }
}
