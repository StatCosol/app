import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface CreateHelpdeskTicketDto {
  category: string;
  subCategory?: string;
  branchId?: string;
  employeeRef?: string;
  priority?: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class HelpdeskService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  /** List helpdesk tickets for current client user */
  listTickets(filters?: {
    branchId?: string;
    status?: string;
    category?: string;
  }): Observable<any[]> {
    let params = new HttpParams();
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.category) params = params.set('category', filters.category);
    return this.http.get<any[]>(
      `${this.baseUrl}/client/helpdesk/tickets`,
      { params },
    );
  }

  /** Create a new helpdesk ticket */
  createTicket(dto: CreateHelpdeskTicketDto): Observable<any> {
    return this.http.post(`${this.baseUrl}/client/helpdesk/tickets`, dto);
  }

  /** Get ticket detail */
  getTicket(ticketId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/client/helpdesk/tickets/${ticketId}`);
  }

  /** List messages for a ticket */
  getMessages(ticketId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.baseUrl}/helpdesk/tickets/${ticketId}/messages`,
    );
  }

  /** Post a message to a ticket */
  postMessage(ticketId: string, message: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/helpdesk/tickets/${ticketId}/messages`,
      { message },
    );
  }
}
