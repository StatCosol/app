import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface SafetyDocument {
  id: string;
  branchId: string;
  branchName?: string;
  clientId: string;
  documentType: string;
  documentName: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  remarks: string | null;
  category: string | null;
  frequency: string | null;
  applicableTo: string | null;
  periodMonth: number | null;
  periodQuarter: number | null;
  periodYear: number | null;
  isMandatory: boolean;
  verifiedByCrm: boolean;
  crmVerifiedAt: string | null;
  verifiedByAuditor: boolean;
  auditorVerifiedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ExpiringDocument {
  id: string;
  documentType: string;
  documentName: string;
  validTo: string;
  category: string;
  branchName: string;
  daysRemaining: number;
}

export interface MasterDocument {
  id: number;
  document_name: string;
  category: string;
  frequency: string;
  applicable_to: string;
  is_mandatory: boolean;
  sort_order: number;
}

export interface SafetyScore {
  overallScore: number;
  categoryScores: Array<{
    category: string;
    weight: number;
    uploaded: number;
    required: number;
    score: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class SafetyDocumentsApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private readonly http: HttpClient) {}

  uploadDocument(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.base}/branch/safety-documents/upload`, formData);
  }

  listForBranch(filters?: {
    documentType?: string;
    category?: string;
    frequency?: string;
  }): Observable<SafetyDocument[]> {
    let params = new HttpParams();
    if (filters?.documentType) params = params.set('documentType', filters.documentType);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    return this.http.get<SafetyDocument[]>(`${this.base}/branch/safety-documents`, { params });
  }

  downloadBranch(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/branch/safety-documents/${docId}/download`, {
      responseType: 'blob',
    });
  }

  getExpiringBranch(): Observable<ExpiringDocument[]> {
    return this.http.get<ExpiringDocument[]>(`${this.base}/branch/safety-documents/expiring`);
  }

  getMasterList(filters?: {
    frequency?: string;
    category?: string;
    applicableTo?: string;
  }): Observable<MasterDocument[]> {
    let params = new HttpParams();
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.applicableTo) params = params.set('applicableTo', filters.applicableTo);
    return this.http.get<MasterDocument[]>(`${this.base}/branch/safety-documents/master`, {
      params,
    });
  }

  getSafetyScoreBranch(): Observable<SafetyScore> {
    return this.http.get<SafetyScore>(`${this.base}/branch/safety-documents/safety-score`);
  }
}
