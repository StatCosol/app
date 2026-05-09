import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

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
  creatorName?: string | null;
  assigneeName?: string | null;
  client?: { id: string; clientName: string; clientCode: string };
}

export interface HdMessage {
  id: string;
  ticketId: string;
  senderUserId: string;
  senderName?: string | null;
  message: string;
  createdAt: string;
}

export interface HdStats {
  total: number;
  open: number;
  inProgress: number;
  awaitingClient: number;
  resolved: number;
  closed: number;
  slaBreached: number;
  categories: { label: string; count: number }[];
}

export interface HdPagedResult {
  data: HdTicket[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class AdminHelpdeskApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/admin/helpdesk`;
  private readonly mgmt = `${environment.apiBaseUrl}/api/v1/helpdesk`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<HdStats> {
    return this.http.get<HdStats>(`${this.base}/stats`);
  }

  listTickets(params?: {
    page?: number;
    limit?: number;
    status?: string;
    category?: string;
    priority?: string;
    clientId?: string;
    search?: string;
  }): Observable<HdPagedResult> {
    let hp = new HttpParams();
    if (params?.page) hp = hp.set('page', params.page);
    if (params?.limit) hp = hp.set('limit', params.limit);
    if (params?.status) hp = hp.set('status', params.status);
    if (params?.category) hp = hp.set('category', params.category);
    if (params?.priority) hp = hp.set('priority', params.priority);
    if (params?.clientId) hp = hp.set('clientId', params.clientId);
    if (params?.search) hp = hp.set('search', params.search);
    return this.http.get<HdPagedResult>(`${this.base}/tickets`, { params: hp });
  }

  getTicket(id: string): Observable<HdTicket> {
    return this.http.get<HdTicket>(`${this.base}/tickets/${id}`);
  }

  assignTicket(ticketId: string, assignedToUserId: string | null): Observable<HdTicket> {
    return this.http.patch<HdTicket>(`${this.base}/tickets/${ticketId}/assign`, { assignedToUserId });
  }

  updateStatus(ticketId: string, status: string): Observable<HdTicket> {
    return this.http.patch<HdTicket>(`${this.mgmt}/tickets/${ticketId}/status`, { status });
  }

  getMessages(ticketId: string): Observable<HdMessage[]> {
    return this.http
      .get<any>(`${this.mgmt}/tickets/${ticketId}/messages`)
      .pipe(map((res) => (Array.isArray(res) ? res : res?.data ?? []) as HdMessage[]));
  }

  postMessage(ticketId: string, message: string): Observable<any> {
    return this.http.post(`${this.mgmt}/tickets/${ticketId}/messages`, { message });
  }
}
