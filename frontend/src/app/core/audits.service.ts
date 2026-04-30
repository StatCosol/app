import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AuditorReportVersion = 'INTERNAL' | 'CLIENT';
export type AuditorReportStage = 'DRAFT' | 'FINAL';

export interface AuditorReportDraft {
  reportId: string | null;
  auditId: string;
  stage: AuditorReportStage;
  version: AuditorReportVersion;
  executiveSummary: string;
  scope: string;
  methodology: string;
  findings: string;
  recommendations: string;
  selectedObservationIds: string[];
  updatedAt: string | null;
  finalizedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuditsService {
  private baseUrl = environment.apiBaseUrl;
  private crmBase = `${this.baseUrl}/api/v1/crm/audits`;
  private auditorBase = `${this.baseUrl}/api/v1/auditor/audits`;
  private contractorBase = `${this.baseUrl}/api/v1/contractor/audits`;

  constructor(private http: HttpClient) {}

  // CRM: create/schedule an audit
  crmCreateAudit(payload: any): Observable<any> {
    return this.http.post(this.crmBase, payload);
  }

  // CRM: list audits for assigned clients
  crmListAudits(params?: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(this.crmBase, { params: p });
  }

  // CRM: get single audit
  crmGetAudit(id: string): Observable<any> {
    return this.http.get(`${this.crmBase}/${id}`);
  }

  // CRM: update audit status
  crmUpdateStatus(id: string, status: string, notes?: string): Observable<any> {
    return this.http.patch(`${this.crmBase}/${id}/status`, { status, notes });
  }

  // CRM: assign auditor / due date / notes update
  crmAssignAuditor(
    id: string,
    payload: { assignedAuditorId?: string; dueDate?: string | null; notes?: string | null },
  ): Observable<any> {
    return this.http.post(`${this.crmBase}/${id}/assign-auditor`, payload);
  }

  // CRM: readiness checklist for audit cockpit
  crmGetReadiness(id: string): Observable<any> {
    return this.http.get(`${this.crmBase}/${id}/readiness`);
  }

  // CRM: report stage/status snapshot
  crmGetReportStatus(id: string): Observable<any> {
    return this.http.get(`${this.crmBase}/${id}/report-status`);
  }

  crmApproveReport(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.crmBase}/${id}/report/approve`, {
      remarks: remarks || null,
    });
  }

  crmPublishReport(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.crmBase}/${id}/report/publish`, {
      remarks: remarks || null,
    });
  }

  crmSendBackReport(id: string, remarks: string): Observable<any> {
    return this.http.post(`${this.crmBase}/${id}/report/send-back`, {
      remarks,
    });
  }

  crmHoldReport(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.crmBase}/${id}/report/hold`, {
      remarks: remarks || null,
    });
  }

  // Auditor: list assigned audits with optional filters
  auditorListAudits(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(this.auditorBase, { params: p });
  }

  // Contractor: list audits assigned to the logged-in contractor
  contractorListAudits(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(this.contractorBase, { params: p });
  }

  // Auditor: get single audit detail
  auditorGetAudit(id: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${id}`);
  }

  // Auditor: update audit status
  auditorUpdateStatus(id: string, status: string, notes?: string): Observable<any> {
    return this.http.patch(`${this.auditorBase}/${id}/status`, { status, notes });
  }

  // Auditor: calculate score
  auditorCalculateScore(id: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${id}/score`, {});
  }

  // Auditor: list contractors for a given client
  auditorListContractors(clientId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/contractors`, { params: { clientId } });
  }

  // Auditor: list documents for an audit
  auditorListAuditDocuments(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/documents`);
  }

  // Auditor: review a document (COMPLIED / NON_COMPLIED)
  auditorReviewDocument(auditId: string, docId: string, decision: string, remarks?: string, sourceTable?: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/documents/${docId}/review`, { decision, remarks, sourceTable });
  }

  // Auditor: submit audit (complete + score)
  auditorSubmitAudit(auditId: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/submit`, {});
  }

  // Auditor: reopen completed audit for re-audit
  auditorReopenAudit(auditId: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/reopen`, {});
  }

  // ── Checklist ──
  auditorGetChecklist(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/checklist`);
  }

  auditorAddChecklistItem(auditId: string, body: { itemLabel: string; docType?: string; isRequired?: boolean }): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/checklist`, body);
  }

  auditorGenerateChecklist(auditId: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/checklist/generate`, {});
  }

  auditorUpdateChecklistItem(auditId: string, itemId: string, body: any): Observable<any> {
    return this.http.patch(`${this.auditorBase}/${auditId}/checklist/${itemId}`, body);
  }

  auditorDeleteChecklistItem(auditId: string, itemId: string): Observable<any> {
    return this.http.delete(`${this.auditorBase}/${auditId}/checklist/${itemId}`);
  }

  // Auditor: report draft state for builder/cockpit
  auditorGetReport(id: string): Observable<AuditorReportDraft> {
    return this.http.get<AuditorReportDraft>(`${this.auditorBase}/${id}/report`);
  }

  // Auditor: save draft content
  auditorSaveReport(
    id: string,
    payload: {
      version: AuditorReportVersion;
      executiveSummary: string;
      scope: string;
      methodology: string;
      findings: string;
      recommendations: string;
      selectedObservationIds: string[];
    },
  ): Observable<AuditorReportDraft> {
    return this.http.put<AuditorReportDraft>(`${this.auditorBase}/${id}/report`, payload);
  }

  // Auditor: finalize draft (locks content)
  auditorFinalizeReport(id: string): Observable<AuditorReportDraft> {
    return this.http.post<AuditorReportDraft>(`${this.auditorBase}/${id}/report/finalize`, {});
  }

  // Auditor: reopen finalized report back to draft
  auditorReopenReport(id: string): Observable<AuditorReportDraft> {
    return this.http.post<AuditorReportDraft>(`${this.auditorBase}/${id}/report/reopen`, {});
  }

  // Auditor: export finalized report pdf
  auditorExportReportPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.auditorBase}/${id}/report/export`, {
      responseType: 'blob',
    });
  }

  // ── AuditXpert: Dashboard ──────────────────────────────────────
  auditorDashboardSummary(): Observable<any> {
    return this.http.get(`${this.auditorBase}/dashboard/summary`);
  }

  auditorUpcomingAudits(): Observable<any> {
    return this.http.get(`${this.auditorBase}/dashboard/upcoming`);
  }

  auditorRecentSubmitted(): Observable<any> {
    return this.http.get(`${this.auditorBase}/dashboard/recent-submitted`);
  }

  // ── AuditXpert: Audit Detail / Workspace ───────────────────────
  auditorGetAuditInfo(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/info`);
  }

  auditorSubmitAuditWithRemark(auditId: string, finalRemark?: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/submit`, { finalRemark });
  }

  auditorForceCompleteAudit(auditId: string, finalRemark?: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/force-complete`, { finalRemark });
  }

  auditorGetUploadLock(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/upload-lock`);
  }

  auditorSetUploadLock(auditId: string, lockFrom: string | null, lockUntil: string | null): Observable<any> {
    return this.http.post(`${this.auditorBase}/${auditId}/upload-lock`, { lockFrom, lockUntil });
  }

  contractorGetUploadLock(auditId: string): Observable<any> {
    return this.http.get(`${this.contractorBase}/${auditId}/upload-lock`);
  }

  auditorGetNonCompliances(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/non-compliances`);
  }

  auditorGetSubmissionHistory(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/submission-history`);
  }

  auditorGetDocumentReviews(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/${auditId}/document-reviews`);
  }

  // ── AuditXpert: Reverification ─────────────────────────────────
  auditorReverificationList(): Observable<any> {
    return this.http.get(`${this.auditorBase}/reverification/list`);
  }

  auditorReviewCorrectedDoc(ncId: string, decision: string, remark?: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/non-compliances/${ncId}/review`, { decision, remark });
  }

  // ── Contractor / Branch NC ─────────────────────────────────────
  contractorListNonCompliances(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/contractor/audit-non-compliances`);
  }

  contractorUploadCorrectedFile(ncId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.baseUrl}/api/v1/contractor/audit-non-compliances/${ncId}/upload`, fd);
  }

  branchListNonCompliances(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/branch/audit-non-compliances`);
  }

  branchUploadCorrectedFile(ncId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.baseUrl}/api/v1/branch/audit-non-compliances/${ncId}/upload`, fd);
  }

  // ── Schedule Automation ────────────────────────────────────────
  private scheduleBase = `${this.baseUrl}/api/v1/audit-schedules`;

  createManualSchedule(payload: {
    clientId: string;
    auditType: string;
    auditorId: string;
    scheduleDate: string;
    dueDate?: string;
    branchId?: string;
    contractorId?: string;
    remarks?: string;
  }): Observable<any> {
    return this.http.post(`${this.scheduleBase}/manual`, payload);
  }

  autoGenerateSchedules(): Observable<any> {
    return this.http.post(`${this.scheduleBase}/auto-generate`, {});
  }

  getAuditorSchedules(params: {
    auditorId: string;
    status?: string;
    clientId?: string;
    auditType?: string;
  }): Observable<any> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) p = p.set(k, v);
    });
    return this.http.get(`${this.scheduleBase}/auditor`, { params: p });
  }

  openAuditWorkspaceFromSchedule(scheduleId: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/open-workspace`, { scheduleId });
  }

  // ── Visibility Layer: Reports ──────────────────────────────────
  auditorGetLatestReport(auditId: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/reports/${auditId}/latest`);
  }

  auditorGetReportHistory(auditId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.auditorBase}/reports/${auditId}/history`);
  }

  // ── Visibility Layer: CRM Summaries ────────────────────────────
  crmGetAuditSummaries(): Observable<any[]> {
    return this.http.get<any[]>(`${this.crmBase}/summaries`);
  }

  crmGetLatestReport(auditId: string): Observable<any> {
    return this.http.get(`${this.crmBase}/${auditId}/latest-report`);
  }

  crmGetReportHistory(auditId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.crmBase}/${auditId}/report-history`);
  }

  // ── Visibility Layer: Client Summaries ─────────────────────────
  private clientBase = `${this.baseUrl}/api/v1/client/audits`;

  clientGetAuditSummaries(): Observable<any[]> {
    return this.http.get<any[]>(`${this.clientBase}/summaries`);
  }

  clientGetLatestReport(auditId: string): Observable<any> {
    return this.http.get(`${this.clientBase}/${auditId}/latest-report`);
  }
}
