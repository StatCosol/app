import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private baseUrl = environment.apiBaseUrl;
  private crmBase = `${this.baseUrl}/api/v1/crm/compliance-tasks`;
  private contractorBase = `${this.baseUrl}/api/v1/contractor/compliance`;
  private auditorBase = `${this.baseUrl}/api/v1/auditor/compliance`;
  private crmDashboardUrl = `${this.baseUrl}/api/v1/crm/dashboard`;
  private contractorDashboardUrl = `${this.baseUrl}/api/v1/contractor/dashboard`;
  private clientDashboardUrl = `${this.baseUrl}/api/v1/client/dashboard`;
  private adminDashboardUrl = `${this.baseUrl}/api/v1/admin/dashboard`;

  constructor(private http: HttpClient) {}

  // CRM
  crmCreateTask(payload: any): Observable<any> {
    return this.http.post(`${this.crmBase}/tasks`, payload);
  }

  crmListTasks(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(`${this.crmBase}/tasks`, { params: p });
  }

  crmTaskDetail(id: string): Observable<any> {
    return this.http.get(`${this.crmBase}/tasks/${id}`);
  }

  crmAssign(id: string, assignedToUserId: string): Observable<any> {
    return this.http.patch(`${this.crmBase}/tasks/${id}/assign`, {
      assignedToUserId,
    });
  }

  crmApprove(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.crmBase}/tasks/${id}/approve`, { remarks });
  }

  crmReject(id: string, remarks: string): Observable<any> {
    return this.http.post(`${this.crmBase}/tasks/${id}/reject`, { remarks });
  }

  crmDashboard(): Observable<any> {
    return this.http.get(this.crmDashboardUrl);
  }

  // Auditor
  auditorListTasks(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(`${this.auditorBase}/tasks`, { params: p });
  }

  auditorTaskDetail(id: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/tasks/${id}`);
  }

  auditorShareReport(id: string, notes: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/tasks/${id}/report`, { notes });
  }

  // Contractor
  contractorListTasks(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(`${this.contractorBase}/tasks`, { params: p });
  }

  getContractorTasks(params: any): Observable<any> {
    return this.contractorListTasks(params || {});
  }

  getContractorTaskById(id: string): Observable<any> {
    return this.http
      .get(`${this.contractorBase}/tasks/${id}`)
      .pipe(catchError(() => this.contractorTaskDetail(id)));
  }

  contractorStart(id: string): Observable<any> {
    return this.http.post(`${this.contractorBase}/tasks/${id}/start`, {});
  }

  contractorSubmit(id: string): Observable<any> {
    return this.http.post(`${this.contractorBase}/tasks/${id}/submit`, {});
  }

  contractorComment(id: string, message: string): Observable<any> {
    return this.http.post(`${this.contractorBase}/tasks/${id}/comment`, {
      message,
    });
  }

  contractorUploadEvidence(
    id: string,
    file: File,
    notes?: string,
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (notes) fd.append('notes', notes);
    return this.http.post(`${this.contractorBase}/tasks/${id}/evidence`, fd);
  }

  uploadContractorTaskFile(
    id: string,
    file: File,
    notes?: string,
  ): Observable<any> {
    return this.contractorUploadEvidence(id, file, notes);
  }

  respondToContractorTask(id: string, message: string): Observable<any> {
    return this.contractorComment(id, message);
  }

  getContractorTaskHistory(id: string): Observable<any> {
    return this.getContractorTaskById(id).pipe(
      map((res: any) => {
        const comments = Array.isArray(res?.comments) ? res.comments : [];
        const evidence = Array.isArray(res?.evidence) ? res.evidence : [];
        const events = [
          ...comments.map((c: any) => ({
            type: 'COMMENT',
            actor: c?.userName || c?.user?.name || 'Unknown user',
            message: c?.message || '',
            at: c?.createdAt || c?.created_at || null,
          })),
          ...evidence.map((e: any) => ({
            type: 'EVIDENCE',
            actor: 'CONTRACTOR',
            message: e?.fileName || e?.file_name || 'Uploaded file',
            at: e?.createdAt || e?.created_at || null,
          })),
        ]
          .filter((e: any) => !!e.at)
          .sort(
            (a: any, b: any) =>
              new Date(b.at).getTime() - new Date(a.at).getTime(),
          );

        return { taskId: id, events };
      }),
    );
  }

  contractorGetReuploadRequests(query: any = {}): Observable<any> {
    let p = new HttpParams();
    Object.keys(query || {}).forEach((k) => {
      if (query[k] !== undefined && query[k] !== null && query[k] !== '') {
        p = p.set(k, String(query[k]));
      }
    });
    return this.http.get(`${this.contractorBase}/reupload-requests`, {
      params: p,
    });
  }

  contractorReuploadUpload(
    requestId: string,
    file: File,
    note?: string,
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (note) fd.append('note', note);
    return this.http.post(
      `${this.contractorBase}/reupload-requests/${requestId}/upload`,
      fd,
    );
  }

  contractorReuploadSubmit(requestId: string): Observable<any> {
    return this.http.post(
      `${this.contractorBase}/reupload-requests/${requestId}/submit`,
      {},
    );
  }

  contractorDashboard(): Observable<any> {
    return this.http.get(this.contractorDashboardUrl);
  }

  clientDashboard(): Observable<any> {
    return this.http.get(this.clientDashboardUrl);
  }

  adminDashboard(): Observable<any> {
    return this.http.get(this.adminDashboardUrl);
  }

  contractorTaskDetail(id: string): Observable<any> {
    // Fallback path for environments where task detail endpoint is unavailable.
    return this.contractorListTasks({}).pipe(
      map((res: any) => {
        const list = res?.data || res || [];
        const task = list.find((t: any) => String(t.id) === String(id));
        return { task, comments: [], evidence: task?.evidence || [] };
      }),
    );
  }
}
