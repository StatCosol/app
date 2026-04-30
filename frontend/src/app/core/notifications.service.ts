import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { map } from 'rxjs/operators';

export type NotificationQueryType = 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT';
// Backend supports a broader lifecycle than just OPEN/CLOSED.
export type NotificationStatus = 'OPEN' | 'IN_PROGRESS' | 'RESPONDED' | 'RESOLVED' | 'CLOSED';

// Alias matching shared components spec
export type QueryType = NotificationQueryType;

export interface CreateNotificationPayload {
  clientId?: string;
  branchId?: string;
  queryType: NotificationQueryType;
  // Backend requires a subject (min length 3). We'll auto-fill if omitted.
  subject?: string;
  message: string;
}

export interface NotificationThreadSummary {
  id: string;
  queryType: NotificationQueryType;
  // UI uses "subject"; backend may return "title".
  subject: string | null;
  clientId: string | null;
  branchId: string | null;
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    roleCode: string | null;
    email: string | null;
  } | null;
  assignedTo: {
    id: string;
    name: string;
    roleCode: string | null;
  } | null;
  lastMessageAt: string;
}

export interface NotificationThreadDetails {
  thread: {
    id: string;
    status: NotificationStatus;
    queryType: NotificationQueryType;
    clientId: string | null;
    branchId: string | null;
    subject: string | null;
  };
  messages: Array<{
    id: string;
    threadId: string;
    message: string;
    createdAt: string;
    from: {
      id: string;
      name: string | null;
      roleCode: string | null;
      email: string | null;
    } | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/notifications`;

  constructor(private http: HttpClient) {}

  /** Normalize backend thread row to UI-friendly shape.
   * Backend variations handled:
   * - subject vs title
   * - queryType vs query_type
   * - createdAt vs created_at
   * - updatedAt vs updated_at
   * - from_user_id/to_user_id naming
   */
  private normalizeThreadRow(r: any): NotificationThreadSummary {
    const queryType = (r?.queryType ?? r?.query_type ?? r?.query_type?.toUpperCase?.()) as NotificationQueryType;
    return {
      id: String(r?.id ?? ''),
      queryType: (queryType || 'TECHNICAL') as NotificationQueryType,
      subject: (r?.subject ?? r?.title ?? null) ? String(r?.subject ?? r?.title) : null,
      clientId: r?.clientId ?? r?.client_id ?? null,
      branchId: r?.branchId ?? r?.branch_id ?? null,
      status: (r?.status ?? 'OPEN') as NotificationStatus,
      createdAt: String(r?.createdAt ?? r?.created_at ?? ''),
      updatedAt: String(r?.updatedAt ?? r?.updated_at ?? r?.createdAt ?? r?.created_at ?? ''),
      createdBy: r?.createdBy ?? r?.from ?? r?.fromUser ?? null,
      assignedTo: r?.assignedTo ?? r?.to ?? r?.toUser ?? null,
      lastMessageAt: String(r?.lastMessageAt ?? r?.last_message_at ?? r?.updatedAt ?? r?.updated_at ?? ''),
    };
  }

  private normalizeThreadDetails(res: any): NotificationThreadDetails {
    const thread = res?.thread ?? res?.data?.thread ?? res?.notification ?? res?.threadRow ?? res;
    const messages = res?.messages ?? res?.data?.messages ?? res?.threadMessages ?? [];

    const q = (thread?.queryType ?? thread?.query_type) as NotificationQueryType;
    const t = {
      id: String(thread?.id ?? ''),
      status: (thread?.status ?? 'OPEN') as NotificationStatus,
      queryType: (q || 'TECHNICAL') as NotificationQueryType,
      clientId: thread?.clientId ?? thread?.client_id ?? null,
      branchId: thread?.branchId ?? thread?.branch_id ?? null,
      subject: (thread?.subject ?? thread?.title ?? null) ? String(thread?.subject ?? thread?.title) : null,
    };

    const normalizedMessages = (Array.isArray(messages) ? messages : []).map((m: any) => ({
      id: String(m?.id ?? ''),
      // Backend may store notification_id instead of thread_id
      threadId: String(m?.threadId ?? m?.thread_id ?? m?.notificationId ?? m?.notification_id ?? t.id),
      message: String(m?.message ?? ''),
      createdAt: String(m?.createdAt ?? m?.created_at ?? ''),
      from: m?.from ?? m?.sender ?? m?.createdBy ?? (m?.sender_user_id ? { id: m.sender_user_id, name: null, roleCode: null, email: null } : null),
    }));

    return { thread: t, messages: normalizedMessages };
  }

  createQuery(payload: CreateNotificationPayload) {
    const normalizedSubject = (payload.subject || '').trim();
    const subject = normalizedSubject.length >= 3 ? normalizedSubject : `${payload.queryType} Query`;

    const body: CreateNotificationPayload & { subject: string } = {
      ...payload,
      subject,
    };

    return this.http.post<{
      threadId: string;
      assignedTo: { userId: string; roleCode: string | null };
      status: NotificationStatus;
    }>(`${this.baseUrl}`, body);
  }

  // Spec-style inbox method used by shared components
  inbox(params: {
    page?: number;
    limit?: number;
    status?: NotificationStatus;
    unreadOnly?: 0 | 1;
  }) {
    let p = new HttpParams();
    if (params.page) p = p.set('page', String(params.page));
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.status) p = p.set('status', params.status);
    if (params.unreadOnly) p = p.set('unreadOnly', String(params.unreadOnly));

    return this.http
      .get<{ data?: any[]; rows?: any[]; total: number }>(`${this.baseUrl}/inbox`, { params: p })
      .pipe(
        map((res) => ({
          data: (res?.data ?? res?.rows ?? []).map((r) => this.normalizeThreadRow(r)),
          total: Number(res?.total ?? 0),
        })),
      );
  }

  // Threads created by the current user
  my(params: {
    page?: number;
    limit?: number;
    status?: NotificationStatus;
    unreadOnly?: 0 | 1;
  }) {
    let p = new HttpParams();
    if (params.page) p = p.set('page', String(params.page));
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.status) p = p.set('status', params.status);
    if (params.unreadOnly) p = p.set('unreadOnly', String(params.unreadOnly));

    return this.http
      .get<{ data?: any[]; rows?: any[]; total: number }>(`${this.baseUrl}/my`, { params: p })
      .pipe(
        map((res) => ({
          data: (res?.data ?? res?.rows ?? []).map((r) => this.normalizeThreadRow(r)),
          total: Number(res?.total ?? 0),
        })),
      );
  }

  // ADMIN-only: list all threads without assignedTo filter
  inboxAdminAll(params: {
    page?: number;
    limit?: number;
    status?: NotificationStatus;
  }) {
    let p = new HttpParams();
    if (params.page) p = p.set('page', String(params.page));
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.status) p = p.set('status', params.status);

    // Admin endpoint returns { rows, total, page, limit } - normalize to { data, total }
    return this.http
      .get<{ rows?: any[]; data?: any[]; total: number }>(`${environment.apiBaseUrl}/api/v1/admin/notifications`, {
        params: p,
      })
      .pipe(
        map((res) => ({
          data: (res?.data ?? res?.rows ?? []).map((r) => this.normalizeThreadRow(r)),
          total: Number(res?.total ?? 0),
        })),
      );
  }

  // Backward-compatible wrapper for any existing callers
  getInbox(params: { page?: number; limit?: number; status?: NotificationStatus | 'all' }) {
    const { status, ...rest } = params || {};
    return this.inbox({
      ...rest,
      status: status === 'all' || !status ? undefined : status,
    });
  }

  getThread(threadId: string) {
    return this.http
      .get<any>(`${this.baseUrl}/threads/${threadId}`)
      .pipe(map((res) => this.normalizeThreadDetails(res)));
  }

  reply(threadId: string, message: string) {
    return this.http.post<{ message: string }>(`${this.baseUrl}/threads/${threadId}/reply`, { message });
  }

  close(threadId: string) {
    return this.http.post<{ status: NotificationStatus }>(`${this.baseUrl}/threads/${threadId}/close`, {});
  }

  reopen(threadId: string) {
    return this.http.post<{ status: NotificationStatus }>(`${this.baseUrl}/threads/${threadId}/reopen`, {});
  }

  /* ── Simple Inbox (notifications/list) for BranchDesk ──── */

  /**
   * List notifications from the flat inbox (notifications/list endpoint).
   * Supports branchId filtering for BranchDesk use.
   */
  listInbox(params: {
    branchId?: string;
    box?: 'INBOX' | 'OUTBOX';
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    let p = new HttpParams();
    if (params.box) p = p.set('box', params.box);
    if (params.branchId) p = p.set('branchId', params.branchId);
    if (params.status) p = p.set('status', params.status);
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.offset) p = p.set('offset', String(params.offset));
    return this.http.get<any[]>(`${this.baseUrl}/list`, { params: p });
  }

  /** Mark a notification as read via PATCH */
  markRead(notificationId: string) {
    return this.http.patch(`${this.baseUrl}/${notificationId}/status`, { status: 'READ' });
  }
}
