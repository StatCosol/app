import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ClientContractorsService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  getBranches(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/branches`);
  }

  getContractors(filters?: { branchId?: string; month?: string }): Observable<any> {
    let params = new HttpParams();
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.month) params = params.set('month', filters.month);
    return this.http.get(`${this.baseUrl}/api/v1/client/contractors`, { params });
  }

  getDocuments(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/contractors/documents`, { params });
  }

  getDashboard(month?: string): Observable<any> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/client/contractors/dashboard`, { params });
  }

  getBranchDashboard(branchId: string, month?: string): Observable<any> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/client/contractors/dashboard/branch/${branchId}`, { params });
  }

  getContractorTrend(contractorId: string, from?: string, to?: string): Observable<any> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get(`${this.baseUrl}/api/v1/client/contractors/dashboard/contractor/${contractorId}`, { params });
  }
}
