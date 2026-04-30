import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Notice {
  id: string;
  noticeCode: string;
  clientId: string;
  branchId: string | null;
  noticeType: string;
  departmentName: string;
  referenceNo: string | null;
  subject: string;
  description: string | null;
  noticeDate: string;
  receivedDate: string;
  responseDueDate: string | null;
  severity: string;
  status: string;
  assignedToUserId: string | null;
  linkedComplianceInstanceId: string | null;
  responseSummary: string | null;
  responseDate: string | null;
  closureRemarks: string | null;
  closedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; clientName: string };
  branch?: { id: string; branchName: string } | null;
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string };
  closedBy?: { id: string; name: string } | null;
  documents?: NoticeDocument[];
  activityLog?: NoticeActivity[];
}

export interface NoticeDocument {
  id: string;
  noticeId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  remarks: string | null;
  uploadedAt: string;
  uploadedBy?: { id: string; name: string };
}

export interface NoticeActivity {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  remarks: string | null;
  actionRole: string;
  createdAt: string;
  actionBy?: { id: string; name: string };
}

export interface NoticeKpis {
  total: number;
  received: number;
  underReview: number;
  actionRequired: number;
  responseDrafted: number;
  responseSubmitted: number;
  closed: number;
  escalated: number;
  overdue: number;
  critical: number;
}

@Injectable({ providedIn: 'root' })
export class NoticesService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  private buildParams(filters: Record<string, any>): HttpParams {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return params;
  }

  // ─── CRM ───
  crmList(filters: any): Observable<Notice[]> {
    return this.http.get<Notice[]>(`${this.base}/api/v1/crm/notices`, { params: this.buildParams(filters) });
  }

  crmKpis(clientId?: string): Observable<NoticeKpis> {
    const params = clientId ? new HttpParams().set('clientId', clientId) : undefined;
    return this.http.get<NoticeKpis>(`${this.base}/api/v1/crm/notices/kpis`, { params });
  }

  crmGetOne(id: string): Observable<Notice> {
    return this.http.get<Notice>(`${this.base}/api/v1/crm/notices/${id}`);
  }

  crmCreate(payload: any): Observable<Notice> {
    return this.http.post<Notice>(`${this.base}/api/v1/crm/notices`, payload);
  }

  crmUpdate(id: string, payload: any): Observable<Notice> {
    return this.http.patch<Notice>(`${this.base}/api/v1/crm/notices/${id}`, payload);
  }

  crmUploadDocument(id: string, file: File, documentType: string, remarks?: string): Observable<NoticeDocument> {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    if (remarks) form.append('remarks', remarks);
    return this.http.post<NoticeDocument>(`${this.base}/api/v1/crm/notices/${id}/documents`, form);
  }

  // ─── Client ───
  clientList(filters: any): Observable<Notice[]> {
    return this.http.get<Notice[]>(`${this.base}/api/v1/client/notices`, { params: this.buildParams(filters) });
  }

  clientKpis(): Observable<NoticeKpis> {
    return this.http.get<NoticeKpis>(`${this.base}/api/v1/client/notices/kpis`);
  }

  clientGetOne(id: string): Observable<Notice> {
    return this.http.get<Notice>(`${this.base}/api/v1/client/notices/${id}`);
  }

  // ─── Branch ───
  branchList(filters: any): Observable<Notice[]> {
    return this.http.get<Notice[]>(`${this.base}/api/v1/branch/notices`, { params: this.buildParams(filters) });
  }

  branchKpis(): Observable<NoticeKpis> {
    return this.http.get<NoticeKpis>(`${this.base}/api/v1/branch/notices/kpis`);
  }

  branchGetOne(id: string): Observable<Notice> {
    return this.http.get<Notice>(`${this.base}/api/v1/branch/notices/${id}`);
  }
}
