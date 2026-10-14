import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CrmDocumentScope = 'COMPANY' | 'BRANCH';

export interface CrmUnitDocument {
  registrationId?: string | null;
  registration?: {id: string; type: string; expiryDate: string | null; status: string} | null;
  id: string;
  clientId: string;
  scope: CrmDocumentScope;
  branchId: string | null;
  month: string | null;
  lawCategory: string;
  documentType: string;
  periodFrom: string | null;
  periodTo: string | null;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  fileSize: number | null;
  uploadedBy: string;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CrmUnitDocumentsApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  registrationOptions(portal: 'branch' | 'crm', clientId: string, branchId: string): Observable<Array<{id: string; type: string; registrationNumber: string | null; expiryDate: string | null}>> {
    return this.http.get<any[]>(this.base + '/' + portal + '/unit-documents/registrations', {params: {clientId, branchId}});
  }

  /* ── CRM endpoints ── */

  uploadDocument(formData: FormData): Observable<{ count: number; documents: Array<{ id: string; fileName: string; createdAt: string }> }> {
    return this.http.post<any>(`${this.base}/crm/unit-documents/upload`, formData);
  }

  listForCrm(filters: {
    clientId?: string;
    branchId?: string;
    scope?: CrmDocumentScope;
    month?: string;
    lawCategory?: string;
    documentType?: string;
  }): Observable<CrmUnitDocument[]> {
    let params = new HttpParams();
    if (filters.clientId) params = params.set('clientId', filters.clientId);
    if (filters.branchId) params = params.set('branchId', filters.branchId);
    if (filters.scope) params = params.set('scope', filters.scope);
    if (filters.month) params = params.set('month', filters.month);
    if (filters.lawCategory) params = params.set('lawCategory', filters.lawCategory);
    if (filters.documentType) params = params.set('documentType', filters.documentType);
    return this.http.get<CrmUnitDocument[]>(`${this.base}/crm/unit-documents`, { params });
  }

  downloadUrl(docId: string, portal: 'branch' | 'client' | 'crm'): string {
    return this.base + '/' + portal + '/unit-documents/' + encodeURIComponent(docId) + '/download';
  }

  downloadCrm(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/crm/unit-documents/${docId}/download`, { responseType: 'blob' });
  }

  deleteDocument(docId: string): Observable<any> {
    return this.http.delete(`${this.base}/crm/unit-documents/${docId}`);
  }

  /* ── Client (LegitX) endpoints ── */

  listForClient(filters: {
    branchId?: string;
    scope?: CrmDocumentScope;
    month?: string;
    lawCategory?: string;
    documentType?: string;
  }): Observable<CrmUnitDocument[]> {
    let params = new HttpParams();
    if (filters.branchId) params = params.set('branchId', filters.branchId);
    if (filters.scope) params = params.set('scope', filters.scope);
    if (filters.month) params = params.set('month', filters.month);
    if (filters.lawCategory) params = params.set('lawCategory', filters.lawCategory);
    if (filters.documentType) params = params.set('documentType', filters.documentType);
    return this.http.get<CrmUnitDocument[]>(`${this.base}/client/unit-documents`, { params });
  }

  downloadClient(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/client/unit-documents/${docId}/download`, { responseType: 'blob' });
  }

  /* ── Branch endpoints ── */

  uploadForBranch(formData: FormData): Observable<CrmUnitDocument> {
    return this.http.post<CrmUnitDocument>(this.base + '/branch/unit-documents/upload', formData);
  }

  listForBranch(filters: {
    scope?: CrmDocumentScope;
    month?: string;
    lawCategory?: string;
    documentType?: string;
  }): Observable<CrmUnitDocument[]> {
    let params = new HttpParams();
    if (filters.scope) params = params.set('scope', filters.scope);
    if (filters.month) params = params.set('month', filters.month);
    if (filters.lawCategory) params = params.set('lawCategory', filters.lawCategory);
    if (filters.documentType) params = params.set('documentType', filters.documentType);
    return this.http.get<CrmUnitDocument[]>(`${this.base}/branch/unit-documents`, { params });
  }

  downloadBranch(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/branch/unit-documents/${docId}/download`, { responseType: 'blob' });
  }
}
