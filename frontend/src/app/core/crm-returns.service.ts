import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CrmReturnsService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  listFilings(params?: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/returns/filings`, { params });
  }

  createFiling(dto: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/crm/returns/filings`, dto);
  }

  getReturnTypes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/returns/types`);
  }

  updateStatus(filingId: string, dto: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/status`, dto);
  }

  uploadAck(filingId: string, file: File, ackNumber?: string): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (ackNumber) fd.append('ackNumber', ackNumber);
    return this.http.post(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/ack`, fd);
  }

  uploadChallan(filingId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/challan`, fd);
  }

  deleteFiling(filingId: string, reason?: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/delete`, { reason });
  }

  bulkReviewBranchInput(
    taskIds: string[],
    payload: { action: string; remarks?: string },
  ): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/returns/bulk/review-branch-input`, {
      taskIds,
      ...payload,
    });
  }

  bulkMarkFiled(
    taskIds: string[],
    payload: { filedOn: string },
  ): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/returns/bulk/filed`, {
      taskIds,
      ...payload,
    });
  }

  bulkVerifyAndClose(taskIds: string[]): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/returns/bulk/verify-close`, {
      taskIds,
    });
  }

  exportCsv(params?: any): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/api/v1/crm/returns/export/csv`, {
      params,
      responseType: 'blob',
    });
  }

  exportXlsx(params?: any): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/api/v1/crm/returns/export/xlsx`, {
      params,
      responseType: 'blob',
    });
  }

  getTimeline(filingId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/timeline`);
  }

  getApprovalHistory(filingId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/approval-history`);
  }

  sendBulkReminders(taskIds: string[], message?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/crm/returns/reminders/bulk`, {
      taskIds,
      message,
    });
  }
}
