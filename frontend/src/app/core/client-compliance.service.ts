import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ClientComplianceService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/dashboard`);
  }

  getBranches(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/branches`);
  }

  getTasks(filters: any): Observable<any> {
    let params = new HttpParams();
    Object.keys(filters || {}).forEach(k => {
      if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
        params = params.set(k, String(filters[k]));
      }
    });
    return this.http.get(`${this.baseUrl}/api/v1/client/compliance/tasks`, { params });
  }

  uploadEvidence(taskId: string | number, file: File, notes?: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return this.http.post(`${this.baseUrl}/api/v1/client/compliance/tasks/${taskId}/evidence`, form);
  }

  uploadEvidenceForItem(taskId: string | number, itemId: string | number, file: File, notes?: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    form.append('mcdItemId', String(itemId));
    if (notes) form.append('notes', notes);
    return this.http.post(`${this.baseUrl}/api/v1/client/compliance/tasks/${taskId}/evidence`, form);
  }

  submitTask(taskId: string | number): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/client/compliance/tasks/${taskId}/submit`, {});
  }

  getMcdItems(taskId: string | number): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/compliance/tasks/${taskId}/items`);
  }

  // ── Compliance Status Dashboard APIs ──

  private statusBase = `${this.baseUrl}/api/v1/legitx/compliance-status`;

  private toParams(filters: Record<string, any>): HttpParams {
    let params = new HttpParams();
    Object.keys(filters).forEach(k => {
      if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
        params = params.set(k, String(filters[k]));
      }
    });
    return params;
  }

  getComplianceStatusSummary(month: number, year: number, branchId?: string): Observable<any> {
    return this.http.get(`${this.statusBase}/summary`, {
      params: this.toParams({ month, year, branchId }),
    });
  }

  getComplianceStatusBranches(month: number, year: number, branchId?: string): Observable<any> {
    return this.http.get(`${this.statusBase}/branches`, {
      params: this.toParams({ month, year, branchId }),
    });
  }

  getComplianceStatusTasks(
    month: number,
    year: number,
    opts?: { branchId?: string; category?: string; status?: string; limit?: number; offset?: number },
  ): Observable<any> {
    return this.http.get(`${this.statusBase}/tasks`, {
      params: this.toParams({ month, year, ...opts }),
    });
  }

  getComplianceStatusContractors(month: number, year: number, branchId?: string): Observable<any> {
    return this.http.get(`${this.statusBase}/contractors`, {
      params: this.toParams({ month, year, branchId }),
    });
  }

  getComplianceStatusAudit(month: number, year: number, branchId?: string): Observable<any> {
    return this.http.get(`${this.statusBase}/audit`, {
      params: this.toParams({ month, year, branchId }),
    });
  }

  getComplianceStatusReturns(month: number, year: number, branchId?: string): Observable<any> {
    return this.http.get(`${this.statusBase}/returns`, {
      params: this.toParams({ month, year, branchId }),
    });
  }
}
