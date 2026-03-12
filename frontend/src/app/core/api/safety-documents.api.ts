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

@Injectable({ providedIn: 'root' })
export class SafetyDocumentsApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  listForClient(filters?: {
    branchId?: string;
    documentType?: string;
    category?: string;
    frequency?: string;
  }): Observable<SafetyDocument[]> {
    let params = new HttpParams();
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.documentType) params = params.set('documentType', filters.documentType);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    return this.http.get<SafetyDocument[]>(`${this.base}/client/safety-documents`, { params });
  }
}
