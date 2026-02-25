import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ComplianceDocument = {
  id: string;
  clientId: string;
  branchId: string | null;
  category: string;
  subCategory: string | null;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  periodLabel: string | null;
  uploadedBy: string;
  uploadedRole: string;
  createdAt: string;
};

export type DocCategory = { code: string; label: string };

@Injectable({ providedIn: 'root' })
export class ComplianceDocumentsService {
  private readonly base = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  // ── Client endpoints ──

  listForClient(filters: Record<string, any>): Observable<ComplianceDocument[]> {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<ComplianceDocument[]>(`${this.base}/api/v1/client/compliance-docs`, { params });
  }

  getCategories(): Observable<DocCategory[]> {
    return this.http.get<DocCategory[]>(`${this.base}/api/v1/client/compliance-docs/categories`);
  }

  getSubCategories(category: string): Observable<DocCategory[]> {
    return this.http.get<DocCategory[]>(`${this.base}/api/v1/client/compliance-docs/categories/${category}/sub`);
  }

  downloadUrl(docId: string): string {
    return `${this.base}/api/v1/client/compliance-docs/${docId}/download`;
  }

  getSettings(): Observable<any> {
    return this.http.get(`${this.base}/api/v1/client/compliance-docs/settings`);
  }

  updateSettings(dto: { allowBranchWageRegisters?: boolean; allowBranchSalaryRegisters?: boolean }): Observable<any> {
    return this.http.post(`${this.base}/api/v1/client/compliance-docs/settings`, dto);
  }

  // ── CRM endpoints ──

  listForCrm(filters: Record<string, any>): Observable<ComplianceDocument[]> {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<ComplianceDocument[]>(`${this.base}/api/v1/crm/compliance-docs`, { params });
  }

  uploadForCrm(formData: FormData): Observable<ComplianceDocument> {
    return this.http.post<ComplianceDocument>(`${this.base}/api/v1/crm/compliance-docs/upload`, formData);
  }

  getCrmCategories(): Observable<DocCategory[]> {
    return this.http.get<DocCategory[]>(`${this.base}/api/v1/crm/compliance-docs/categories`);
  }

  getCrmSubCategories(category: string): Observable<DocCategory[]> {
    return this.http.get<DocCategory[]>(`${this.base}/api/v1/crm/compliance-docs/categories/${category}/sub`);
  }

  crmDownloadUrl(docId: string): string {
    return `${this.base}/api/v1/crm/compliance-docs/${docId}/download`;
  }

  deleteCrmDoc(docId: string): Observable<any> {
    return this.http.delete(`${this.base}/api/v1/crm/compliance-docs/${docId}`);
  }
}
