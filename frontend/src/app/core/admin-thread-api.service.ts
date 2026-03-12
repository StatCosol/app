import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ThreadApi } from '../shared/thread/services/thread-api.interface';
import {
  ThreadDetail,
  ThreadFilters,
  ThreadListItem,
  ThreadMessage,
  ThreadRole,
} from '../shared/thread/models/thread.model';
import { PageRes } from '../shared/models/paging.model';
import { environment } from '../../environments/environment';

/**
 * Admin Notifications API adapter for the shared Thread UI.
 * Wraps /api/v1/admin/notifications endpoints.
 */
@Injectable({ providedIn: 'root' })
export class AdminThreadApiService implements ThreadApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1/admin/notifications`;

  constructor(private http: HttpClient) {}

  list(filters: ThreadFilters): Observable<PageRes<ThreadListItem>> {
    let p = new HttpParams();
    if (filters.page) p = p.set('page', String(filters.page));
    if (filters.limit) p = p.set('limit', String(filters.limit));
    if (filters.status) p = p.set('status', filters.status);
    if (filters.type) p = p.set('queryType', filters.type);
    if (filters.q) p = p.set('q', filters.q);
    if (filters.unread) p = p.set('unreadOnly', '1');

    return this.http.get<any>(this.base, { params: p }).pipe(
      map(res => ({
        items: (res?.rows ?? res?.data ?? []).map((r: any) => this.toListItem(r)),
        total: res?.total ?? 0,
        page: filters.page ?? 1,
        limit: filters.limit ?? 20,
      })),
    );
  }

  read(id: string): Observable<ThreadDetail> {
    return this.http.get<any>(`${environment.apiBaseUrl}/api/v1/notifications/threads/${id}`).pipe(
      map(res => this.toDetail(res)),
    );
  }

  reply(id: string, message: string, files: File[] = []): Observable<any> {
    if (files.length) {
      const fd = new FormData();
      fd.append('message', message);
      files.forEach(f => fd.append('files', f));
      return this.http.post(`${environment.apiBaseUrl}/api/v1/notifications/threads/${id}/reply`, fd);
    }
    return this.http.post(`${environment.apiBaseUrl}/api/v1/notifications/threads/${id}/reply`, { message });
  }

  close(id: string): Observable<any> {
    return this.setStatus(id, 'CLOSED');
  }

  resolve(id: string): Observable<any> {
    return this.setStatus(id, 'RESOLVED');
  }

  reopen(id: string): Observable<any> {
    return this.setStatus(id, 'OPEN');
  }

  setStatus(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'): Observable<any> {
    return this.http.patch(`${this.base}/${id}/status`, { status });
  }

  private toListItem(r: any): ThreadListItem {
    const createdByRole = this.normalizeRole(
      r?.createdBy?.roleCode ?? r?.from?.roleCode ?? r?.createdByRole ?? 'CLIENT',
    );
    const priority = this.normalizePriority(r?.priority, r?.queryType ?? r?.query_type);

    return {
      id: String(r?.id ?? ''),
      type: r?.queryType ?? r?.query_type ?? 'GENERAL',
      status: r?.status ?? 'OPEN',
      fromRole: createdByRole,
      fromName: r?.createdBy?.name ?? r?.from?.name ?? '',
      subject: r?.subject ?? r?.title ?? '(No subject)',
      lastMessageAt: r?.lastMessageAt ?? r?.last_message_at ?? r?.updatedAt ?? '',
      unread: !!r?.unread,
      priority,
      clientName: r?.clientName ?? '',
      branchName: r?.branchName ?? '',
      // extra fields used by admin helpdesk center
      ...{
        createdAt: r?.createdAt ?? '',
        updatedAt: r?.updatedAt ?? '',
        assignedToName: r?.assignedTo?.name ?? '',
        assignedToRole: this.normalizeRole(r?.assignedTo?.roleCode ?? ''),
      },
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

  private normalizePriority(
    rawPriority: unknown,
    queryType: unknown,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const p = String(rawPriority ?? '').toUpperCase().trim();
    if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p)) {
      return p as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }
    if (p === '1') return 'LOW';
    if (p === '2') return 'MEDIUM';
    if (p === '3') return 'HIGH';
    if (p === '4' || p === '5') return 'CRITICAL';

    const q = String(queryType ?? '').toUpperCase().trim();
    if (q === 'AUDIT') return 'HIGH';
    if (q === 'TECHNICAL') return 'HIGH';
    if (q === 'COMPLIANCE') return 'MEDIUM';
    return 'LOW';
  }

  private normalizeRole(role: unknown): ThreadRole {
    const value = String(role ?? '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (value === 'PAYROLL') return 'PAYDEK';
    if (
      value === 'ADMIN' ||
      value === 'CRM' ||
      value === 'CLIENT' ||
      value === 'BRANCH' ||
      value === 'CONTRACTOR' ||
      value === 'AUDITOR' ||
      value === 'PAYDEK' ||
      value === 'CCO' ||
      value === 'CEO'
    ) {
      return value;
    }
    return 'CLIENT';
  }
}
