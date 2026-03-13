import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ThreadApi } from '../shared/thread/services/thread-api.interface';
import { ThreadDetail, ThreadFilters, ThreadListItem, ThreadMessage } from '../shared/thread/models/thread.model';
import { PageRes } from '../shared/models/paging.model';
import { environment } from '../../environments/environment';

/**
 * CRM Queries API adapter for the shared Thread UI.
 * Wraps /api/v1/notifications endpoints with role context.
 */
@Injectable({ providedIn: 'root' })
export class CrmThreadApiService implements ThreadApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1/notifications`;

  constructor(private http: HttpClient) {}

  list(filters: ThreadFilters): Observable<PageRes<ThreadListItem>> {
    let p = new HttpParams();
    if (filters.page) p = p.set('page', String(filters.page));
    if (filters.limit) p = p.set('limit', String(filters.limit));
    if (filters.status) p = p.set('status', filters.status);
    if (filters.type) p = p.set('queryType', filters.type);
    if (filters.q) p = p.set('q', filters.q);
    if (filters.unread) p = p.set('unreadOnly', '1');
    if (filters.fromRole) p = p.set('role', filters.fromRole);

    return this.http.get<any>(`${this.base}/inbox`, { params: p }).pipe(
      map(res => ({
        items: (res?.data ?? res?.rows ?? []).map((r: any) => this.toListItem(r)),
        total: res?.total ?? 0,
        page: filters.page ?? 1,
        limit: filters.limit ?? 20,
      })),
    );
  }

  read(id: string): Observable<ThreadDetail> {
    return this.http.get<any>(`${this.base}/threads/${id}`).pipe(
      map(res => this.toDetail(res)),
    );
  }

  reply(id: string, message: string, files: File[] = []): Observable<any> {
    if (files.length) {
      const fd = new FormData();
      fd.append('message', message);
      files.forEach(f => fd.append('files', f));
      return this.http.post(`${this.base}/threads/${id}/reply`, fd);
    }
    return this.http.post(`${this.base}/threads/${id}/reply`, { message });
  }

  close(id: string): Observable<any> {
    return this.http.post(`${this.base}/threads/${id}/close`, {});
  }

  resolve(id: string): Observable<any> {
    return this.http.post(`${this.base}/threads/${id}/close`, {});
  }

  reopen(id: string): Observable<any> {
    return this.http.post(`${this.base}/threads/${id}/reopen`, {});
  }

  private toListItem(r: any): ThreadListItem {
    return {
      id: String(r?.id ?? ''),
      type: r?.queryType ?? r?.query_type ?? 'GENERAL',
      status: r?.status ?? 'OPEN',
      fromRole: r?.createdBy?.roleCode ?? r?.from?.roleCode ?? 'CLIENT',
      fromName: r?.createdBy?.name ?? r?.from?.name ?? '',
      subject: r?.subject ?? r?.title ?? '(No subject)',
      lastMessageAt: r?.lastMessageAt ?? r?.last_message_at ?? r?.updatedAt ?? '',
      unread: !!r?.unread,
      clientName: r?.clientName ?? '',
      branchName: r?.branchName ?? '',
    };
  }

  private toDetail(res: any): ThreadDetail {
    const t = res?.thread ?? res?.data?.thread ?? res;
    const msgs = res?.messages ?? res?.data?.messages ?? [];
    return {
      id: String(t?.id ?? ''),
      type: t?.queryType ?? t?.query_type ?? 'GENERAL',
      status: t?.status ?? 'OPEN',
      subject: t?.subject ?? t?.title ?? '',
      messages: (msgs || []).map((m: any): ThreadMessage => ({
        id: String(m?.id ?? ''),
        senderRole: m?.from?.roleCode ?? m?.sender?.roleCode ?? 'CLIENT',
        senderName: m?.from?.name ?? m?.sender?.name ?? '',
        message: m?.message ?? '',
        createdAt: m?.createdAt ?? m?.created_at ?? '',
        attachments: (m?.attachments ?? []).map((a: any) => ({ name: a.name ?? a.filename ?? '', url: a.url ?? '' })),
      })),
    };
  }
}
