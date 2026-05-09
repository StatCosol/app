import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AppraisalCycle,
  AppraisalTemplate,
  EmployeeAppraisal,
  AppraisalDashboard,
  RatingScale,
  AppraisalPaginatedResult,
} from '../models/appraisal.models';

@Injectable({ providedIn: 'root' })
export class PerformanceAppraisalService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/appraisal`;

  constructor(private http: HttpClient) {}

  // ── Cycles ────────────────────────────────────────────────
  getCycles(branchId?: string): Observable<AppraisalCycle[]> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<AppraisalCycle[]>(`${this.base}/cycles`, { params });
  }

  getCycle(id: string): Observable<AppraisalCycle> {
    return this.http.get<AppraisalCycle>(`${this.base}/cycles/${id}`);
  }

  createCycle(data: Partial<AppraisalCycle> & { scopes?: any[] }): Observable<AppraisalCycle> {
    return this.http.post<AppraisalCycle>(`${this.base}/cycles`, data);
  }

  updateCycle(id: string, data: Partial<AppraisalCycle>): Observable<AppraisalCycle> {
    return this.http.put<AppraisalCycle>(`${this.base}/cycles/${id}`, data);
  }

  activateCycle(id: string): Observable<AppraisalCycle> {
    return this.http.post<AppraisalCycle>(`${this.base}/cycles/${id}/activate`, {});
  }

  closeCycle(id: string): Observable<AppraisalCycle> {
    return this.http.post<AppraisalCycle>(`${this.base}/cycles/${id}/close`, {});
  }

  generateEmployees(cycleId: string): Observable<{ generated: number; total: number; alreadyExisted: number }> {
    return this.http.post<any>(`${this.base}/cycles/${cycleId}/generate`, {});
  }

  // ── Employee Appraisals ───────────────────────────────────
  getAppraisals(filter: Record<string, any>): Observable<AppraisalPaginatedResult> {
    let params = new HttpParams();
    Object.entries(filter).forEach(([k, v]) => { if (v != null) params = params.set(k, v); });
    return this.http.get<AppraisalPaginatedResult>(`${this.base}/employees`, { params });
  }

  getAppraisal(id: string): Observable<EmployeeAppraisal> {
    return this.http.get<EmployeeAppraisal>(`${this.base}/employees/${id}`);
  }

  getDashboard(branchId?: string): Observable<AppraisalDashboard> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<AppraisalDashboard>(`${this.base}/employees/dashboard`, { params });
  }

  managerReview(id: string, data: any): Observable<EmployeeAppraisal> {
    return this.http.post<EmployeeAppraisal>(`${this.base}/employees/${id}/manager-review`, data);
  }

  branchReview(id: string, data: any): Observable<EmployeeAppraisal> {
    return this.http.post<EmployeeAppraisal>(`${this.base}/employees/${id}/branch-review`, data);
  }

  clientApprove(id: string, data: { action: string; remarks?: string; recommendation?: string; recommendedIncrementPercent?: number; recommendedNewCtc?: number }): Observable<EmployeeAppraisal> {
    return this.http.post<EmployeeAppraisal>(`${this.base}/employees/${id}/client-approve`, data);
  }

  sendBack(id: string, remarks: string): Observable<any> {
    return this.http.post(`${this.base}/employees/${id}/send-back`, { remarks });
  }

  lockAppraisal(id: string): Observable<any> {
    return this.http.post(`${this.base}/employees/${id}/lock`, {});
  }

  getHistory(id: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/employees/${id}/history`);
  }

  // ── Templates ─────────────────────────────────────────────
  getTemplates(): Observable<AppraisalTemplate[]> {
    return this.http.get<AppraisalTemplate[]>(`${this.base}/templates`);
  }

  getTemplate(id: string): Observable<AppraisalTemplate> {
    return this.http.get<AppraisalTemplate>(`${this.base}/templates/${id}`);
  }

  createTemplate(data: any): Observable<AppraisalTemplate> {
    return this.http.post<AppraisalTemplate>(`${this.base}/templates`, data);
  }

  // ── Rating Scales ─────────────────────────────────────────
  getScales(): Observable<RatingScale[]> {
    return this.http.get<RatingScale[]>(`${this.base}/templates/scales/list`);
  }

  createScale(data: any): Observable<RatingScale> {
    return this.http.post<RatingScale>(`${this.base}/templates/scales`, data);
  }

  // ── Reports ───────────────────────────────────────────────
  getBranchSummary(cycleId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (cycleId) params = params.set('cycleId', cycleId);
    return this.http.get<any[]>(`${this.base}/reports/branch-summary`, { params });
  }

  getDepartmentSummary(cycleId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (cycleId) params = params.set('cycleId', cycleId);
    return this.http.get<any[]>(`${this.base}/reports/department-summary`, { params });
  }

  getRecommendations(cycleId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (cycleId) params = params.set('cycleId', cycleId);
    return this.http.get<any[]>(`${this.base}/reports/recommendations`, { params });
  }

  exportAppraisals(cycleId?: string): Observable<any[]> {
    let params = new HttpParams();
    if (cycleId) params = params.set('cycleId', cycleId);
    return this.http.get<any[]>(`${this.base}/reports/export`, { params });
  }
}
