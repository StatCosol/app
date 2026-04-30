import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ClientBranchesService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  /** List branches with counts; optional state/status filters */
  list(filters?: { state?: string; status?: string }): Observable<any[]> {
    let params = new HttpParams();
    if (filters?.state) params = params.set('state', filters.state);
    if (filters?.status) params = params.set('status', filters.status);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches`, { params });
  }

  /** Single branch detail with counts */
  getById(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/${id}`);
  }


  /** Create a new branch (MASTER client user only) */
  create(dto: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/client/branches`, dto);
  }


  /* ── Documents ────────────────────────── */

  listDocuments(branchId: string, filters?: Record<string, any>): Observable<any[]> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach((k) => {
        if (filters[k] != null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/documents`, { params });
  }

  uploadDocument(branchId: string, file: File, meta: { category: string; docType: string; periodYear?: number; periodMonth?: number }): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', meta.category);
    fd.append('docType', meta.docType);
    if (meta.periodYear) fd.append('periodYear', String(meta.periodYear));
    if (meta.periodMonth) fd.append('periodMonth', String(meta.periodMonth));
    return this.http.post(`${this.baseUrl}/api/v1/client/branches/${branchId}/documents/upload`, fd);
  }

  reuploadDocument(docId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.put(`${this.baseUrl}/api/v1/client/branches/documents/${docId}/reupload`, fd);
  }

  /* ── MCD ──────────────────────────────── */

  /** Branch compliance items (state-specific resolver) */
  getBranchComplianceItems(branchId: string, month: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/branches/${branchId}/compliance-items`, {
      params: { month },
    });
  }

  getMcdSchedule(branchId: string, year?: number, month?: number): Observable<any> {
    let params = new HttpParams();
    if (year) params = params.set('year', String(year));
    if (month) params = params.set('month', String(month));
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/${branchId}/mcd`, { params });
  }

  getMcdOverview(branchId: string, months = 6): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/mcd/overview`, {
      params: new HttpParams().set('months', String(months)),
    });
  }

  /* ── Dashboard ────────────────────────── */

  getDashboard(branchId: string, month?: string): Observable<any> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/${branchId}/dashboard`, { params });
  }

  /* ── Registrations ────────────────────── */

  /** List registrations/licenses for a branch */
  listRegistrations(branchId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/registrations`);
  }

  /* ── CRM Registration CRUD ────────────── */

  /** CRM: List registrations for a branch+client */
  crmListRegistrations(branchId: string, clientId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/branch-registrations`, {
      params: new HttpParams().set('branchId', branchId).set('clientId', clientId),
    });
  }

  /** CRM: Create a new registration */
  createRegistration(clientId: string, payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/crm/branch-registrations/for-client/${clientId}`, payload);
  }

  /** CRM: Update a registration */
  updateRegistration(id: string, clientId: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/branch-registrations/${id}/for-client/${clientId}`, payload);
  }

  /** CRM: Delete (soft) a registration */
  deleteRegistration(id: string, clientId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/crm/branch-registrations/${id}/for-client/${clientId}`);
  }

  /** CRM: Upload registration document (or renewal) */
  uploadRegistrationFile(id: string, clientId: string, formData: FormData, field: 'document' | 'renewal' = 'document'): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/api/v1/crm/branch-registrations/${id}/for-client/${clientId}/upload?field=${field}`,
      formData,
    );
  }

  /* ── Registration Summary / Alerts ──────── */

  /** Client-wide registration compliance summary */
  getRegistrationSummary(branchId?: string): Observable<any> {
    if (branchId) {
      return this.http.get(`${this.baseUrl}/api/v1/client/branches/${branchId}/registration-summary`);
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/branches/registration-summary`);
  }

  /** Get registration alerts */
  getRegistrationAlerts(branchId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/registration-alerts`, { params });
  }

  /* ── Audit Observations ────────────────── */

  /** List audit observations for a branch */
  listAuditObservations(branchId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/client/branches/${branchId}/audit-observations`);
  }

  /* ── Compliance Calendar ────────────────── */

  /** Get calendar items for a date range */
  getCalendar(params: { from: string; to: string; branchId?: string; module?: string; clientId?: string }): Observable<any> {
    let p = new HttpParams().set('from', params.from).set('to', params.to);
    if (params.branchId) p = p.set('branchId', params.branchId);
    if (params.module) p = p.set('module', params.module);
    if (params.clientId) p = p.set('clientId', params.clientId);
    return this.http.get(`${this.baseUrl}/api/v1/calendar`, { params: p });
  }

  /* ── Risk Heatmap ─────────────────────── */

  getRiskHeatmap(params: { month: string; clientId?: string }): Observable<any> {
    let p = new HttpParams().set('month', params.month);
    if (params.clientId) p = p.set('clientId', params.clientId);
    return this.http.get(`${this.baseUrl}/api/v1/risk/heatmap`, { params: p });
  }

  /* ── Risk Trend ───────────────────────── */

  getRiskTrend(params: { branchId: string; from: string; to: string }): Observable<any> {
    const p = new HttpParams()
      .set('branchId', params.branchId)
      .set('from', params.from)
      .set('to', params.to);
    return this.http.get(`${this.baseUrl}/api/v1/risk/trend`, { params: p });
  }

  /* ── SLA Tracker ──────────────────────── */

  getSlaTasks(params: any): Observable<any> {
    let p = new HttpParams();
    if (params) {
      Object.keys(params).forEach((k) => {
        if (params[k] != null && params[k] !== '') p = p.set(k, String(params[k]));
      });
    }
    return this.http.get(`${this.baseUrl}/api/v1/sla/tasks`, { params: p });
  }

  updateSlaTask(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/sla/tasks/${id}`, payload);
  }

  /* ── Escalations ──────────────────────── */

  getEscalations(params?: { status?: string; branchId?: string }): Observable<any> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    if (params?.branchId) p = p.set('branchId', params.branchId);
    return this.http.get(`${this.baseUrl}/api/v1/escalations`, { params: p });
  }

  updateEscalation(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/escalations/${id}`, payload);
  }

  /* ── Monthly Document Uploads ─────────── */

  /** Get uploaded documents for a branch + month (optionally filtered by code) */
  getMonthlyDocuments(branchId: string, month: string, code?: string): Observable<any[]> {
    let params = new HttpParams().set('branchId', branchId).set('month', month);
    if (code) params = params.set('code', code);
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/documents/monthly`, { params });
  }

  /** Upload a compliance document */
  uploadMonthlyDocument(payload: { branchId: string; month: string; code: string; file: File }): Observable<any> {
    const fd = new FormData();
    fd.append('file', payload.file);
    fd.append('branchId', payload.branchId);
    fd.append('month', payload.month);
    fd.append('code', payload.code);
    return this.http.post(`${this.baseUrl}/api/v1/documents/monthly/upload`, fd);
  }

  /** Delete a monthly document */
  deleteMonthlyDocument(docId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/documents/monthly/${docId}`);
  }

  /* ── Compliance Metrics ───────────────── */

  /** Get upload completion % for branches visible to the current user */
  getComplianceCompletion(month: string, branchId?: string): Observable<any> {
    let p = new HttpParams().set('month', month);
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/completion`, { params: p });
  }

  /** Get the N branches with the lowest upload completion % */
  getLowestBranches(month: string, limit = 5): Observable<any> {
    const p = new HttpParams().set('month', month).set('limit', limit.toString());
    return this.http.get(`${this.baseUrl}/api/v1/compliance/lowest-branches`, { params: p });
  }

  /** Get month-wise completion trend for a branch */
  getComplianceCompletionTrend(branchId: string, months = 6): Observable<any> {
    const p = new HttpParams().set('branchId', branchId).set('months', months.toString());
    return this.http.get(`${this.baseUrl}/api/v1/compliance/completion-trend`, { params: p });
  }

  /** Get inspection exposure / risk score for a branch (or all branches) */
  getRiskScore(month: string, branchId?: string): Observable<any> {
    let p = new HttpParams().set('month', month);
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/risk-score`, { params: p });
  }

  /** Get top N highest + lowest risk branches */
  getRiskRanking(month: string, limit = 10): Observable<any> {
    const p = new HttpParams().set('month', month).set('limit', limit.toString());
    return this.http.get(`${this.baseUrl}/api/v1/compliance/risk-ranking`, { params: p });
  }

  /** Get state-wise compliance risk heatmap aggregation */
  getComplianceRiskHeatmap(month: string): Observable<any> {
    const p = new HttpParams().set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/risk-heatmap`, { params: p });
  }

  /** Get smart action plan for a specific branch */
  getActionPlan(month: string, branchId: string): Observable<any> {
    const p = new HttpParams().set('month', month).set('branchId', branchId);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/action-plan`, { params: p });
  }

  /** Get next-month risk forecast for a branch */
  getRiskForecast(branchId: string, monthsHistory = 6): Observable<any> {
    const p = new HttpParams().set('branchId', branchId).set('monthsHistory', monthsHistory.toString());
    return this.http.get(`${this.baseUrl}/api/v1/compliance/risk-forecast`, { params: p });
  }

  /** Get AI-style compliance summary (branch or company) */
  getComplianceSummary(month: string, branchId?: string): Observable<any> {
    let p = new HttpParams().set('month', month);
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/summary`, { params: p });
  }

  /** Get benchmark scores for all branches */
  getBenchmark(month: string): Observable<any> {
    const p = new HttpParams().set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/benchmark`, { params: p });
  }

  /** Simulate risk score with what-if inputs */
  simulateRisk(body: {
    month: string;
    branchId: string;
    completionPercent: number;
    overdueSla: number;
    expiringRegistrations: boolean;
    highCritical: number;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/compliance/simulate-risk`, body);
  }

  /** Get executive export pack (JSON for PDF/PPT) */
  getExportPack(month: string): Observable<any> {
    const p = new HttpParams().set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/export-pack`, { params: p });
  }

  /** Download executive export pack as XLSX blob */
  downloadExportPackXlsx(month: string): Observable<Blob> {
    const p = new HttpParams().set('month', month);
    return this.http.get(`${this.baseUrl}/api/v1/compliance/export-pack/xlsx`, {
      params: p,
      responseType: 'blob',
    });
  }
}
