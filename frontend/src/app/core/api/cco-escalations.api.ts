import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface CcoEscalation {
  id: string;
  clientId: string;
  branchId: string;
  client?: { clientName: string } | null;
  branch?: { branchName: string } | null;
  reason: string;
  riskScore: number;
  slaOverdueCount: number;
  status: 'OPEN' | 'ACK' | 'CLOSED';
  createdAt: string;
}

export interface CcoEscalationPage {
  items: CcoEscalation[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class CcoEscalationsApi {
  constructor(private http: HttpClient) {}
  list(query: { page: number; limit: number; status: string; q: string }) {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.status) params = params.set('status', query.status);
    if (query.q) params = params.set('q', query.q);
    return this.http.get<CcoEscalationPage>(`${environment.apiBaseUrl}/api/v1/cco/escalations`, { params });
  }
  updateStatus(record: CcoEscalation, status: 'ACK' | 'CLOSED') {
    return this.http.patch<CcoEscalation>(`${environment.apiBaseUrl}/api/v1/escalations/${record.id}`, {
      clientId: record.clientId, status,
    });
  }
}
