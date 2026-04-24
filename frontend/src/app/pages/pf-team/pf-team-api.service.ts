import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface HdTicket {
  id: string;
  category: string;
  subCategory: string | null;
  clientId: string;
  branchId: string | null;
  employeeRef: string | null;
  priority: string;
  status: string;
  description: string;
  createdByUserId: string;
  assignedToUserId: string | null;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; clientName: string; clientCode: string };
}

export interface HdMessage {
  id: string;
  ticketId: string;
  senderUserId: string;
  message: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class PfTeamApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/pf-team/helpdesk`;
  private readonly mgmt = `${environment.apiBaseUrl}/api/v1/helpdesk`;

  constructor(private http: HttpClient) {}

  listTickets(params?: {
    status?: string;
    category?: string;
    clientId?: string;
  }): Observable<HdTicket[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.category) q.set('category', params.category);
    if (params?.clientId) q.set('clientId', params.clientId);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return this.http.get<any>(`${this.base}/tickets${suffix}`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? []) as HdTicket[]),
    );
  }

  getTicket(id: string): Observable<HdTicket> {
    return this.http.get<HdTicket>(`${this.base}/tickets/${id}`);
  }

  getMessages(ticketId: string): Observable<HdMessage[]> {
    return this.http
      .get<any>(`${environment.apiBaseUrl}/api/v1/helpdesk/tickets/${ticketId}/messages`)
      .pipe(map((res) => (Array.isArray(res) ? res : res?.data ?? []) as HdMessage[]));
  }

  postMessage(ticketId: string, message: string): Observable<any> {
    return this.http.post(
      `${environment.apiBaseUrl}/api/v1/helpdesk/tickets/${ticketId}/messages`,
      { message },
    );
  }

  updateStatus(ticketId: string, status: string): Observable<any> {
    return this.http.patch(`${this.mgmt}/tickets/${ticketId}/status`, { status });
  }
}
