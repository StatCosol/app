import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import { ThreadApi } from '../shared/thread/services/thread-api.interface';
import {
  ThreadDetail,
  ThreadFilters,
  ThreadListItem,
  ThreadType,
} from '../shared/thread/models/thread.model';
import { PageRes } from '../shared/models/paging.model';
import { environment } from '../../environments/environment';

@Injectable()
export class CrmOperationalApiService implements ThreadApi {
  private base = `${environment.apiBaseUrl}/api/v1`;
  constructor(private http: HttpClient) {}
  private type(ticket: any): ThreadType {
    return String(ticket.category).includes('AUDIT') ? 'AUDIT' : 'COMPLIANCE';
  }
  list(filters: ThreadFilters): Observable<PageRes<ThreadListItem>> {
    return this.http.get<any[]>(`${this.base}/crm/helpdesk/tickets`).pipe(
      map((tickets) => {
        const rows: ThreadListItem[] = (tickets || []).map((ticket) => ({
          id: ticket.id,
          type: this.type(ticket),
          status: ticket.status === 'AWAITING_CLIENT' ? 'RESPONDED' : ticket.status,
          fromRole: 'CLIENT',
          subject: `${ticket.category}${ticket.subCategory ? ' / ' + ticket.subCategory : ''}: ${ticket.description}`,
          lastMessageAt: ticket.updatedAt,
          unread: false,
        }));
        const filtered = rows.filter(
          (row) =>
            (!filters.status || row.status === filters.status) &&
            (!filters.type || row.type === filters.type) &&
            (!filters.q || row.subject.toLowerCase().includes(filters.q.toLowerCase())),
        );
        const page = filters.page || 1,
          limit = filters.limit || 20;
        return {
          items: filtered.slice((page - 1) * limit, page * limit),
          total: filtered.length,
          page,
          limit,
        };
      }),
    );
  }
  read(id: string): Observable<ThreadDetail> {
    return forkJoin({
      ticket: this.http.get<any>(`${this.base}/crm/helpdesk/tickets/${id}`),
      messages: this.http.get<any[]>(`${this.base}/helpdesk/tickets/${id}/messages`),
    }).pipe(
      map(({ ticket, messages }) => ({
        id,
        type: this.type(ticket),
        status: ticket.status === 'AWAITING_CLIENT' ? 'RESPONDED' : ticket.status,
        subject: `${ticket.category}${ticket.subCategory ? ' / ' + ticket.subCategory : ''}`,
        messages: [
          {
            id: `${id}-request`,
            senderRole: 'CLIENT' as const,
            message: ticket.description,
            createdAt: ticket.createdAt,
          },
          ...messages.map((message) => ({
            id: message.id,
            senderRole: message.senderRole || 'CLIENT',
            senderName: message.senderName,
            message: message.message,
            createdAt: message.createdAt,
            attachments: message.attachments || [],
          })),
        ],
      })),
    );
  }
  reply(id: string, message: string, files: File[] = []): Observable<any> {
    return this.http.post(`${this.base}/helpdesk/tickets/${id}/messages`, { message }).pipe(
      concatMap((result) =>
        files.length
          ? forkJoin(
              files.map((file) => {
                const body = new FormData();
                body.append('file', file);
                return this.http.post(`${this.base}/helpdesk/tickets/${id}/files`, body);
              }),
            )
          : of(result),
      ),
    );
  }
  private status(id: string, status: string) {
    return this.http.patch(`${this.base}/helpdesk/tickets/${id}/status`, { status });
  }
  close(id: string) {
    return this.status(id, 'CLOSED');
  }
  resolve(id: string) {
    return this.status(id, 'RESOLVED');
  }
  reopen(id: string) {
    return this.status(id, 'OPEN');
  }
}
