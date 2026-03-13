import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ComplianceTaskDto, Paged } from '../models/compliance.models';

type Portal = 'crm' | 'client' | 'contractor' | 'auditor' | 'admin' | 'legitx';

@Injectable({ providedIn: 'root' })
export class ComplianceApiService {
  constructor(private http: HttpClient) {}

  private v1(path: string) {
    return `/api/v1/${path}`;
  }

  private toParams(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || `${v}`.trim?.() === '') return;
      p = p.set(k, `${v}`);
    });
    return p;
  }

  // =========================
  // CRM — Compliance Tasks
  // Controller: crm/compliance-tasks
  // Routes: GET tasks, GET tasks/:id, POST tasks, PATCH assign, POST approve, POST reject
  // =========================

  crmGetTasks(query: {
    clientId?: string;
    branchId?: string;
    status?: string;
    monthKey?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Observable<Paged<ComplianceTaskDto>> {
    return this.http.get<Paged<ComplianceTaskDto>>(this.v1('crm/compliance-tasks/tasks'), {
      params: this.toParams(query),
    });
  }

  crmGetTask(taskId: string) {
    return this.http.get(this.v1(`crm/compliance-tasks/tasks/${taskId}`));
  }

  crmCreateTask(payload: any) {
    return this.http.post(this.v1('crm/compliance-tasks/tasks'), payload);
  }

  crmAssignTask(taskId: string, payload: { assignedToUserId: string }) {
    return this.http.patch(this.v1(`crm/compliance-tasks/tasks/${taskId}/assign`), payload);
  }

  crmApproveTask(taskId: string, remarks?: string) {
    return this.http.post(this.v1(`crm/compliance-tasks/tasks/${taskId}/approve`), { remarks });
  }

  crmRejectTask(taskId: string, remarks: string) {
    return this.http.post(this.v1(`crm/compliance-tasks/tasks/${taskId}/reject`), { remarks });
  }

  crmTaskKpis() {
    return this.http.get<{
      total: number; pending: number; inProgress: number; submitted: number;
      approved: number; rejected: number; overdue: number; dueToday: number; dueSoon: number;
    }>(this.v1('crm/compliance-tasks/tasks/kpis'));
  }

  crmBulkApprove(taskIds: number[], remarks?: string) {
    return this.http.post<{ approved: number; failed: number; results: any[] }>(
      this.v1('crm/compliance-tasks/tasks/bulk-approve'), { taskIds, remarks },
    );
  }

  crmBulkReject(taskIds: number[], remarks: string) {
    return this.http.post<{ rejected: number; failed: number; results: any[] }>(
      this.v1('crm/compliance-tasks/tasks/bulk-reject'), { taskIds, remarks },
    );
  }

  // MCD Return + Lock
  crmReturnMcd(branchId: string, payload: { year: number; month: number; remarks: string; itemIds?: string[] }) {
    return this.http.post(this.v1(`crm/compliance-tracker/mcd/${branchId}/return`), payload);
  }

  crmLockMcd(branchId: string, payload: { year: number; month: number }) {
    return this.http.post(this.v1(`crm/compliance-tracker/mcd/${branchId}/lock`), payload);
  }

  // =========================
  // Client (Master Client) — Compliance Tasks
  // Controller: client/compliance
  // Routes: GET tasks, POST tasks/:id/evidence, POST tasks/:id/submit, GET tasks/:id/items
  // =========================

  clientGetTasks(query: {
    branchId?: string;
    status?: string;
    monthKey?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Observable<Paged<ComplianceTaskDto>> {
    return this.http.get<Paged<ComplianceTaskDto>>(this.v1('client/compliance/tasks'), {
      params: this.toParams(query),
    });
  }

  clientGetTaskItems(taskId: string) {
    return this.http.get(this.v1(`client/compliance/tasks/${taskId}/items`));
  }

  clientUploadEvidence(taskId: string, file: File, note?: string) {
    const fd = new FormData();
    fd.append('file', file);
    if (note) fd.append('note', note);
    return this.http.post(this.v1(`client/compliance/tasks/${taskId}/evidence`), fd);
  }

  clientSubmitTask(taskId: string) {
    return this.http.post(this.v1(`client/compliance/tasks/${taskId}/submit`), {});
  }

  // =========================
  // BranchDesk — Branch Compliance Docs (NOT the same as "tasks")
  // Controller: branch/compliance-docs
  // Routes: checklist, upload, dashboard-kpis, trend, risk, etc.
  // Use this for branch document checklist/dashboard, not crm/compliance-tasks.
  // =========================

  branchGetChecklist(query?: { monthKey?: string }) {
    return this.http.get(this.v1('branch/compliance-docs/checklist'), {
      params: this.toParams(query || {}),
    });
  }

  branchUploadComplianceDoc(file: File, meta?: Record<string, any>) {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      fd.append(k, `${v}`);
    });
    return this.http.post(this.v1('branch/compliance-docs/upload'), fd);
  }

  branchDashboardKpis(query?: { monthKey?: string }) {
    return this.http.get(this.v1('branch/compliance-docs/dashboard-kpis'), {
      params: this.toParams(query || {}),
    });
  }

  branchListDocs(query?: Record<string, any>) {
    return this.http.get(this.v1('branch/compliance-docs'), {
      params: this.toParams(query || {}),
    });
  }

  branchReturnMaster() {
    return this.http.get(this.v1('branch/compliance-docs/return-master'));
  }

  // =========================
  // MCD — CRM tracker + LegitX read
  // Controller: crm/compliance-tracker  (GET mcd, POST mcd/:branchId/finalize)
  // Controller: legitx                (GET mcd)
  // =========================

  crmGetMcd(query?: { clientId?: string; branchId?: string; monthKey?: string }) {
    return this.http.get(this.v1('crm/compliance-tracker/mcd'), {
      params: this.toParams(query || {}),
    });
  }

  crmFinalizeMcd(branchId: string, payload?: any) {
    return this.http.post(this.v1(`crm/compliance-tracker/mcd/${branchId}/finalize`), payload || {});
  }

  legitxGetMcd(query?: { branchId?: string; monthKey?: string }) {
    return this.http.get(this.v1('legitx/mcd'), {
      params: this.toParams(query || {}),
    });
  }

  // =========================
  // LegitX Compliance Status (summary/branches/tasks/etc.)
  // Controller: legitx/compliance-status
  // =========================

  legitxTasks(query?: { branchId?: string; monthKey?: string; status?: string }) {
    return this.http.get(this.v1('legitx/compliance-status/tasks'), {
      params: this.toParams(query || {}),
    });
  }

  legitxSummary(query?: { monthKey?: string }) {
    return this.http.get(this.v1('legitx/compliance-status/summary'), {
      params: this.toParams(query || {}),
    });
  }

  legitxBranches(query?: { monthKey?: string }) {
    return this.http.get(this.v1('legitx/compliance-status/branches'), {
      params: this.toParams(query || {}),
    });
  }

  // =========================
  // CRM — Audit Closures
  // Controller: crm/compliance-tracker
  // Routes: GET audit-closures, POST audit-closures/:observationId/close
  // =========================

  crmGetAuditClosures(query?: { clientId?: string; branchId?: string; monthKey?: string }) {
    return this.http.get(this.v1('crm/compliance-tracker/audit-closures'), {
      params: this.toParams(query || {}),
    });
  }

  crmCloseAuditObservation(observationId: string, payload?: any) {
    return this.http.post(this.v1(`crm/compliance-tracker/audit-closures/${observationId}/close`), payload || {});
  }

  crmGetReuploadBacklog() {
    return this.http.get(this.v1('crm/compliance-tracker/reupload-backlog'));
  }

  crmListReuploadRequests(query?: {
    status?: string; targetRole?: string; clientId?: string;
    unitId?: string; q?: string; page?: number; limit?: number;
    overdue?: boolean; dueSoon?: boolean; slaDays?: number;
  }) {
    return this.http.get<{ items: any[]; total: number; page: number; limit: number }>(
      this.v1('crm/compliance-tracker/reupload-requests'),
      { params: this.toParams(query || {}) },
    );
  }

  crmTopOverdueReuploadUnits(query?: { slaDays?: number }) {
    return this.http.get<any[]>(
      this.v1('crm/compliance-tracker/reupload-top-units'),
      { params: this.toParams(query || {}) },
    );
  }

  // =========================
  // Contractor Compliance
  // Controller: contractor/compliance
  // =========================

  contractorGetTasks(query?: { status?: string; monthKey?: string; q?: string; page?: number; limit?: number }) {
    return this.http.get(this.v1('contractor/compliance/tasks'), {
      params: this.toParams(query || {}),
    });
  }

  contractorGetTask(taskId: string) {
    return this.http.get(this.v1(`contractor/compliance/tasks/${taskId}`));
  }

  contractorStartTask(taskId: string) {
    return this.http.post(this.v1(`contractor/compliance/tasks/${taskId}/start`), {});
  }

  contractorSubmitTask(taskId: string) {
    return this.http.post(this.v1(`contractor/compliance/tasks/${taskId}/submit`), {});
  }

  contractorAddComment(taskId: string, comment: string) {
    return this.http.post(this.v1(`contractor/compliance/tasks/${taskId}/comment`), { comment });
  }

  contractorUploadEvidence(taskId: string, file: File, meta?: Record<string, any>) {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      fd.append(k, `${v}`);
    });
    return this.http.post(this.v1(`contractor/compliance/tasks/${taskId}/evidence`), fd);
  }

  // Reupload Requests
  contractorGetReuploadRequests(query?: { status?: string; page?: number; limit?: number }) {
    return this.http.get(this.v1('contractor/compliance/reupload-requests'), {
      params: this.toParams(query || {}),
    });
  }

  contractorGetDocRemarks(docId: string) {
    return this.http.get(this.v1(`contractor/compliance/docs/${docId}/remarks`));
  }

  contractorReuploadUpload(requestId: string, file: File, note?: string) {
    const fd = new FormData();
    fd.append('file', file);
    if (note) fd.append('note', note);
    return this.http.post(this.v1(`contractor/compliance/reupload-requests/${requestId}/upload`), fd);
  }

  contractorReuploadSubmit(requestId: string) {
    return this.http.post(this.v1(`contractor/compliance/reupload-requests/${requestId}/submit`), {});
  }

  // =========================
  // Client (LegitX) Reupload
  // Controller: client/compliance
  // =========================

  clientListReuploadRequests(query?: { status?: string; page?: number; limit?: number }) {
    return this.http.get(this.v1('client/compliance/reupload-requests'), {
      params: this.toParams(query || {}),
    });
  }

  clientReuploadUpload(requestId: string, file: File, note?: string) {
    const fd = new FormData();
    fd.append('file', file);
    if (note) fd.append('note', note);
    return this.http.post(this.v1(`client/compliance/reupload-requests/${requestId}/upload`), fd);
  }

  clientReuploadSubmit(requestId: string) {
    return this.http.post(this.v1(`client/compliance/reupload-requests/${requestId}/submit`), {});
  }

  // =========================
  // Branch (BranchDesk) Reupload
  // Controller: branch/compliance-docs
  // =========================

  branchListReuploadRequests(query?: { status?: string; page?: number; limit?: number }) {
    return this.http.get(this.v1('branch/compliance-docs/reupload-requests'), {
      params: this.toParams(query || {}),
    });
  }

  branchReuploadUpload(requestId: string, file: File, note?: string) {
    const fd = new FormData();
    fd.append('file', file);
    if (note) fd.append('note', note);
    return this.http.post(this.v1(`branch/compliance-docs/reupload-requests/${requestId}/upload`), fd);
  }

  branchReuploadSubmit(requestId: string) {
    return this.http.post(this.v1(`branch/compliance-docs/reupload-requests/${requestId}/submit`), {});
  }

  // =========================
  // Auditor Compliance
  // Controller: auditor/compliance + auditor/compliance-docs
  // =========================

  auditorOverview(query?: any) {
    return this.http.get(this.v1('auditor/compliance'), {
      params: this.toParams(query || {}),
    });
  }

  auditorGetTasks(query?: { clientId?: string; branchId?: string; status?: string; q?: string; page?: number; limit?: number }) {
    return this.http.get(this.v1('auditor/compliance/tasks'), {
      params: this.toParams(query || {}),
    });
  }

  auditorGetTask(taskId: string) {
    return this.http.get(this.v1(`auditor/compliance/tasks/${taskId}`));
  }

  auditorGetDocs(query?: { clientId?: string; branchId?: string; q?: string; page?: number; limit?: number }) {
    return this.http.get(this.v1('auditor/compliance/docs'), {
      params: this.toParams(query || {}),
    });
  }

  auditorCreateReuploadRequests(payload: { taskId: string; items: { docId: string; remarks: string }[] }) {
    return this.http.post(this.v1('auditor/compliance/reupload-requests'), payload);
  }

  auditorListReuploadRequests(query?: { status?: string; clientId?: string }) {
    return this.http.get(this.v1('auditor/compliance/reupload-requests'), {
      params: this.toParams(query || {}),
    });
  }

  auditorApproveReupload(requestId: string, remarks?: string) {
    return this.http.post(this.v1(`auditor/compliance/reupload-requests/${requestId}/approve`), { remarks });
  }

  auditorRejectReupload(requestId: string, remarks: string) {
    return this.http.post(this.v1(`auditor/compliance/reupload-requests/${requestId}/reject`), { remarks });
  }

  // =========================
  // Export Pack (blob download)
  // =========================

  exportPack(query?: {
    clientId?: string;
    branchId?: string;
    monthKey?: string;
    type?: string;
  }): Observable<Blob> {
    return this.http.get(this.v1('compliance/export-pack'), {
      params: this.toParams(query || {}),
      responseType: 'blob',
    });
  }
}
