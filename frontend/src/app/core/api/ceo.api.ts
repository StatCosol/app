import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CeoApproval {
  id: number;
  entityType: string;
  entityId: string;
  status: string;
  remarks?: string;
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

export interface CeoNotification {
  id: number;
  subject?: string;
  status?: string;
  createdAt?: string;
  read?: boolean;
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

  getNotifications(): Observable<CeoNotification[]> {
    return this.http.get<CeoNotification[]>('/api/v1/ceo/notifications');
  }

  markNotificationRead(id: number): Observable<any> {
    return this.http.post(`/api/v1/ceo/notifications/${id}/read`, {});
  }
}
