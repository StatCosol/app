import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CeoService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getApprovals(status: string = 'PENDING'): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/approvals`, { params: { status } });
  }
  getApproval(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/approvals/${id}`);
  }
  approveClientDeletion(id: number, note: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/ceo/approvals/${id}/approve`, { note });
  }
  rejectClientDeletion(id: number, reason: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/ceo/approvals/${id}/reject`, { reason });
  }
  getEscalations(params: any = {}): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/escalations`, { params });
  }
  getEscalation(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/escalations/${id}`);
  }
  commentOnEscalation(id: number, message: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/ceo/escalations/${id}/comment`, { message });
  }
  assignEscalationToCco(id: number, ccoId: number, note: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/ceo/escalations/${id}/assign-to-cco`, { ccoId, note });
  }
  closeEscalation(id: number, resolutionNote: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/ceo/escalations/${id}/close`, { resolutionNote });
  }
  getOversightSummary(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/oversight/cco-summary`);
  }
  getOversightItems(ccoId: number, status: string = 'OPEN'): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/oversight/cco/${ccoId}/items`, { params: { status } });
  }
  getNotifications(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/ceo/notifications`);
  }
  markNotificationRead(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/ceo/notifications/${id}/read`, {});
  }
}
