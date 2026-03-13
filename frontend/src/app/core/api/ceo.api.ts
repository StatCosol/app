import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CeoApproval {
  id: number;
  entityType: string;
  entityId: string;
  status: string;
  remarks?: string;
  entityLabel?: string;
  requestedBy?: { id: string; name: string; email: string };
  requestedTo?: { id: string; name: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CeoEscalation {
  id: number;
  status: string;
  subject?: string;
  createdAt?: string;
  comments?: any[];
}

export interface CeoOversightSummary {
  ccoSummary: any[];
}

export interface CeoReportPack {
  id: string;
  title: string;
  description?: string;
  metrics: Record<string, any>;
}

export interface CeoReportsSummary {
  period: string;
  generatedAt: string;
  packs: CeoReportPack[];
}

export interface CeoReportPreview {
  type: string;
  title: string;
  period: string;
  columns: Array<{ key: string; label: string }>;
  rows: any[];
}

@Injectable({ providedIn: 'root' })
export class CeoApiService {
  constructor(private http: HttpClient) {}

  getApprovals(): Observable<CeoApproval[]> {
    return this.http.get<CeoApproval[]>('/api/v1/ceo/approvals');
  }

  getApproval(id: string): Observable<CeoApproval> {
    return this.http.get<CeoApproval>(`/api/v1/ceo/approvals/${id}`);
  }

  approve(id: string | number): Observable<any> {
    return this.http.post(`/api/v1/ceo/approvals/${id}/approve`, {});
  }

  reject(id: string | number, remarks: string): Observable<any> {
    return this.http.post(`/api/v1/ceo/approvals/${id}/reject`, { remarks });
  }

  getEscalations(): Observable<{ items: CeoEscalation[]; total: number }> {
    return this.http.get<{ items: CeoEscalation[]; total: number }>('/api/v1/ceo/escalations');
  }

  getEscalation(id: string): Observable<CeoEscalation> {
    return this.http.get<CeoEscalation>(`/api/v1/ceo/escalations/${id}`);
  }

  commentOnEscalation(id: string | number, message: string): Observable<any> {
    return this.http.post(`/api/v1/ceo/escalations/${id}/comment`, { message });
  }

  closeEscalation(id: string | number, resolutionNote: string): Observable<any> {
    return this.http.post(`/api/v1/ceo/escalations/${id}/close`, { resolutionNote });
  }

  getOversightSummary(): Observable<CeoOversightSummary> {
    return this.http.get<CeoOversightSummary>('/api/v1/ceo/oversight/cco-summary');
  }

  getReportsSummary(period?: string): Observable<CeoReportsSummary> {
    const params: any = {};
    if (period) params.period = period;
    return this.http.get<CeoReportsSummary>('/api/v1/ceo/reports/summary', { params });
  }

  getReportPreview(type: string, period?: string): Observable<CeoReportPreview> {
    const params: any = { type };
    if (period) params.period = period;
    return this.http.get<CeoReportPreview>('/api/v1/ceo/reports/preview', { params });
  }

  exportReportCsv(type: string, period?: string): Observable<Blob> {
    const params: any = { type, format: 'csv' };
    if (period) params.period = period;
    return this.http.get('/api/v1/ceo/reports/export', {
      params,
      responseType: 'blob',
    });
  }

  getReportPdfLink(type: string, period?: string): Observable<{ downloadUrl: string }> {
    const params: any = { type, format: 'pdf' };
    if (period) params.period = period;
    return this.http.get<{ downloadUrl: string }>('/api/v1/ceo/reports/export', { params });
  }
}
