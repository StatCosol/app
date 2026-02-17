import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminMastersService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  // Compliance Masters
  listComplianceMasters(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/admin/masters/compliances`);
  }

  getComplianceMaster(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/admin/masters/compliances/${id}`);
  }

  createComplianceMaster(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/admin/masters/compliances`, data);
  }

  updateComplianceMaster(id: string, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/admin/masters/compliances/${id}`, data);
  }

  deleteComplianceMaster(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/admin/masters/compliances/${id}`);
  }

  // Audit Categories
  listAuditCategories(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/admin/masters/audit-categories`);
  }

  createAuditCategory(data: { name: string; description?: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/admin/masters/audit-categories`, data);
  }

  updateAuditCategory(id: string, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/admin/masters/audit-categories/${id}`, data);
  }

  deleteAuditCategory(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/admin/masters/audit-categories/${id}`);
  }
}
