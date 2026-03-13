import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ThreadApi } from '../shared/thread/services/thread-api.interface';
import {
  ThreadDetail,
  ThreadFilters,
  ThreadListItem,
  ThreadMessage,
  ThreadRole,
  ThreadType,
} from '../shared/thread/models/thread.model';
import { PageRes } from '../shared/models/paging.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class BranchThreadApiService implements ThreadApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1/notifications`;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  list(filters: ThreadFilters): Observable<PageRes<ThreadListItem>> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.unread) params = params.set('unreadOnly', '1');

    return this.http.get<any>(`${this.base}/inbox`, { params }).pipe(
      map((res) => {
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.max(1, Number(filters.limit || 20));
        const q = String(filters.q || '').trim().toLowerCase();
        const typeFilter = filters.type || '';

        let items = (res?.data ?? res?.rows ?? []).map((row: any) =>
          this.toListItem(row),
        );

        if (typeFilter) {
          items = items.filter((item: ThreadListItem) => item.type === typeFilter);
        }
        if (q) {
          items = items.filter((item: ThreadListItem) => {
            const haystack = [
              item.subject,
              item.fromName,
              item.clientName,
              item.branchName,
              item.type,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(q);
          });
        }

        const total = items.length;
        const start = (page - 1) * limit;
        const pagedItems = items.slice(start, start + limit);
        return { items: pagedItems, total, page, limit };
      }),
    );
  }

  read(id: string): Observable<ThreadDetail> {
    return this.http
      .get<any>(`${this.base}/threads/${id}`)
      .pipe(map((res) => this.toDetail(res)));
  }

  reply(id: string, message: string, files: File[] = []): Observable<any> {
    if (files.length) {
      const form = new FormData();
      form.append('message', message);
      files.forEach((file) => form.append('files', file));
      return this.http.post(`${this.base}/threads/${id}/reply`, form);
    }
    return this.http.post(`${this.base}/threads/${id}/reply`, { message });
  }

  close(id: string): Observable<any> {
    return this.http.post(`${this.base}/threads/${id}/close`, {});
  }

  reopen(id: string): Observable<any> {
    return this.http.post(`${this.base}/threads/${id}/reopen`, {});
  }

  createTicket(input: {
    subject: string;
    queryType: 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL';
    message: string;
  }): Observable<any> {
    const user = this.auth.getUser();
    const branchIds = this.auth.getBranchIds();

    const payload: Record<string, string> = {
      subject: input.subject.trim(),
      queryType: input.queryType,
      message: input.message.trim(),
    };
    if (user?.clientId) payload['clientId'] = user.clientId;
    if (branchIds.length) payload['branchId'] = branchIds[0];

    return this.http.post(`${this.base}`, payload);
  }

  private toListItem(row: any): ThreadListItem {
    const type = this.normalizeType(row?.queryType ?? row?.query_type);
    const fromRole = this.normalizeRole(
      row?.createdBy?.roleCode ?? row?.from?.roleCode ?? 'BRANCH',
    );

    return {
      id: String(row?.id ?? ''),
      type,
      status: row?.status ?? 'OPEN',
      fromRole,
      fromName: row?.createdBy?.name ?? row?.from?.name ?? '',
      subject: row?.subject ?? row?.title ?? '(No subject)',
      lastMessageAt:
        row?.lastMessageAt ??
        row?.last_message_at ??
        row?.updatedAt ??
        row?.createdAt ??
        '',
      unread: !!row?.unread,
      priority: this.normalizePriority(row?.priority),
      clientName: row?.clientName ?? '',
      branchName: row?.branchName ?? '',
    };
  }

  private toDetail(res: any): ThreadDetail {
    const thread = res?.thread ?? res?.data?.thread ?? res;
    const messages = res?.messages ?? res?.data?.messages ?? [];

    return {
      id: String(thread?.id ?? ''),
      type: this.normalizeType(thread?.queryType ?? thread?.query_type),
      status: thread?.status ?? 'OPEN',
      subject: thread?.subject ?? thread?.title ?? '(No subject)',
      messages: (messages || []).map(
        (message: any): ThreadMessage => ({
          id: String(message?.id ?? ''),
          senderRole: this.normalizeRole(
            message?.from?.roleCode ?? message?.sender?.roleCode ?? 'BRANCH',
          ),
          senderName: message?.from?.name ?? message?.sender?.name ?? '',
          message: message?.message ?? '',
          createdAt: message?.createdAt ?? message?.created_at ?? '',
          attachments: (message?.attachments ?? []).map((attachment: any) => ({
            name: attachment?.name ?? attachment?.filename ?? '',
            url: attachment?.url ?? '',
          })),
        }),
      ),
    };
  }

  private normalizeType(value: unknown): ThreadType {
    const v = String(value || '').toUpperCase().trim();
    if (
      v === 'TECHNICAL' ||
      v === 'COMPLIANCE' ||
      v === 'AUDIT' ||
      v === 'GENERAL'
    ) {
      return v;
    }
    return 'GENERAL';
  }

  private normalizePriority(
    value: unknown,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const priority = String(value || '').toUpperCase().trim();
    if (
      priority === 'LOW' ||
      priority === 'MEDIUM' ||
      priority === 'HIGH' ||
      priority === 'CRITICAL'
    ) {
      return priority;
    }
    return 'MEDIUM';
  }

  private normalizeRole(value: unknown): ThreadRole {
    const role = String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (role === 'PAYROLL') return 'PAYDEK';
    if (
      role === 'ADMIN' ||
      role === 'CRM' ||
      role === 'CLIENT' ||
      role === 'BRANCH' ||
      role === 'CONTRACTOR' ||
      role === 'AUDITOR' ||
      role === 'PAYDEK' ||
      role === 'CCO' ||
      role === 'CEO'
    ) {
      return role;
    }
    return 'BRANCH';
  }
}
