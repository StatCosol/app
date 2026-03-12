import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Prefer apiBaseUrl; keep apiUrl fallback for legacy configs
const API = (environment as any).apiUrl || environment.apiBaseUrl;

export interface AuditorDocRow {
  id: number;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedByUserId: string;
  createdAt: string;
  task?: any;
}

export interface ReuploadRequest {
  id: string;
  documentId: number;
  documentType: string;
  targetRole: string;
  requestedByRole: string;
  reason: string;
  remarksVisible: string;
  status: string;
  deadlineDate?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuditorAuditService {
  constructor(private http: HttpClient) {}

  listDocs(filters: any = {}): Observable<{ data: AuditorDocRow[] }> {
    return this.http.get<{ data: AuditorDocRow[] }>(`${API}/auditor/compliance/docs`, { params: filters });
  }

  addRemark(docId: string | number, remark: { text: string; visibility: string }): Observable<any> {
    return this.http.post(`${API}/auditor/compliance/docs/${docId}/remark`, remark);
  }

  requestReupload(docId: string | number, payload: { reason: string; remarks: string; deadlineDate?: string }): Observable<any> {
    return this.http.post(`${API}/auditor/compliance/docs/${docId}/request-reupload`, payload);
  }

  createReuploadRequests(
    taskId: string | number,
    items: Array<{ docId: string | number; remarks: string }>,
  ): Observable<any> {
    return this.http.post(`${API}/auditor/compliance/reupload-requests`, {
      taskId: String(taskId),
      items: items.map((item) => ({
        docId: String(item.docId),
        remarks: item.remarks,
      })),
    });
  }

  listReuploadRequests(filters: any = {}): Observable<{ data: ReuploadRequest[] }> {
    return this.http.get<{ data: ReuploadRequest[] }>(`${API}/auditor/compliance/reupload-requests`, { params: filters });
  }

  downloadDoc(docId: string | number): string {
    // Returns signed URL or direct download path
    return `${API}/auditor/compliance/docs/${docId}/download`;
  }
}
