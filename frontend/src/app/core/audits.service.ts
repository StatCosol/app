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
}
