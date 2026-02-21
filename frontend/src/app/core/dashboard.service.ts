import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CrmSummary,
  CrmDueCompliancesResponse,
  CrmLowCoverageResponse,
  CrmPendingDocumentsResponse,
  CrmQueriesResponse,
} from '../pages/crm/crm-dashboard.dto';
import {
  AuditorSummary,
  AuditorAuditsResponse,
  AuditorObservationsResponse,
  AuditorEvidenceResponse,
  AuditorActivityResponse,
} from '../pages/auditor/auditor-dashboard.dto';
import { PfEsiSummaryResponse, ContractorUploadSummaryResponse } from '../pages/client/dashboard/client-dashboard.types';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  // ===== Client Dashboard (PF/ESI + Contractor uploads) =====

  getClientPfEsiSummary(params: { month: string; branchId?: string }): Observable<PfEsiSummaryResponse> {
    const httpParams = new HttpParams({ fromObject: { month: params.month, ...(params.branchId ? { branchId: params.branchId } : {}) } });
    return this.http.get<PfEsiSummaryResponse>(`${this.baseUrl}/api/client-dashboard/pf-esi-summary`, { params: httpParams });
  }

  getClientContractorUploadSummary(params: { month: string; branchId?: string }): Observable<ContractorUploadSummaryResponse> {
    const httpParams = new HttpParams({ fromObject: { month: params.month, ...(params.branchId ? { branchId: params.branchId } : {}) } });
    return this.http.get<ContractorUploadSummaryResponse>(`${this.baseUrl}/api/client-dashboard/contractor-upload-summary`, { params: httpParams });
  }

  /** @deprecated Legacy CRM dashboard endpoint */
  crm(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/crm/dashboard`);
  }

  /** Get CRM summary KPIs */
  getCrmSummary(filters: Record<string, string> = {}): Observable<CrmSummary> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<CrmSummary>(`${this.baseUrl}/api/crm/dashboard/summary`, { params });
  }

  /** Get compliance due items (tab: OVERDUE, DUE_SOON, THIS_MONTH) */
  getCrmDueCompliances(filters: Record<string, string> = {}): Observable<CrmDueCompliancesResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<CrmDueCompliancesResponse>(`${this.baseUrl}/api/crm/dashboard/due-compliances`, { params });
  }

  /** Get branches with low compliance coverage */
  getCrmLowCoverage(filters: Record<string, string> = {}): Observable<CrmLowCoverageResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<CrmLowCoverageResponse>(`${this.baseUrl}/api/crm/dashboard/low-coverage-branches`, { params });
  }

  /** Get pending documents from contractors */
  getCrmPendingDocuments(filters: Record<string, string> = {}): Observable<CrmPendingDocumentsResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<CrmPendingDocumentsResponse>(`${this.baseUrl}/api/crm/dashboard/pending-documents`, { params });
  }

  /** Get compliance queries inbox */
  getCrmQueries(filters: Record<string, string> = {}): Observable<CrmQueriesResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<CrmQueriesResponse>(`${this.baseUrl}/api/crm/dashboard/queries`, { params });
  }

  // ===== Auditor Dashboard Endpoints =====

  /** Get Auditor summary KPIs */
  getAuditorSummary(filters: Record<string, string> = {}): Observable<AuditorSummary> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<AuditorSummary>(`${this.baseUrl}/api/auditor/dashboard/summary`, { params });
  }

  /** Get auditor's assigned audits (tab: ACTIVE, OVERDUE, DUE_SOON, COMPLETED) */
  getAuditorAudits(filters: Record<string, string> = {}): Observable<AuditorAuditsResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<AuditorAuditsResponse>(`${this.baseUrl}/api/auditor/dashboard/audits`, { params });
  }

  /** Get observations pending closure */
  getAuditorObservations(filters: Record<string, string> = {}): Observable<AuditorObservationsResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<AuditorObservationsResponse>(`${this.baseUrl}/api/auditor/dashboard/observations`, { params });
  }

  /** Get evidence/documents pending */
  getAuditorEvidence(filters: Record<string, string> = {}): Observable<AuditorEvidenceResponse> {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params = params.set(key, filters[key]);
      }
    });
    return this.http.get<AuditorEvidenceResponse>(`${this.baseUrl}/api/auditor/dashboard/evidence-pending`, { params });
  }

  /** Get recent activity timeline */
  getAuditorActivity(): Observable<AuditorActivityResponse> {
    return this.http.get<AuditorActivityResponse>(`${this.baseUrl}/api/auditor/dashboard/activity`);
  }

  // ===== Legacy Endpoints =====

  contractor(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/contractor/dashboard`);
  }

  client(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/client/dashboard`);
  }

  /** @deprecated Legacy auditor dashboard endpoint */
  auditor(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/auditor/dashboard`);
  }

  admin(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/admin/dashboard`);
  }

  /** Auditor: list my assigned branches (branch-wise auditor assignment) */
  getAuditorBranches(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/auditor/branches`);
  }
}
