import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const API = `${environment.apiBaseUrl}/api/v1`;

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
}
