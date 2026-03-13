import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, map } from 'rxjs';

export type PayrollClientSetup = {
  id?: string;
  clientId: string;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  lwfEnabled: boolean;
  pfEmployerRate: number;
  pfEmployeeRate: number;
  esiEmployerRate: number;
  esiEmployeeRate: number;
  pfWageCeiling: number;
  esiWageCeiling: number;
  payCycle: string;
  effectiveFrom: string;
  cycleStartDay: number;
  payoutDay: number;
  lockDay: number;
  arrearMode: 'CURRENT' | 'NEXT';
  leaveAccrualPerMonth: number;
  maxCarryForward: number;
  allowCarryForward: boolean;
  lopMode: 'PRORATED' | 'FULL_DAY';
  attendanceSource: 'MANUAL' | 'BIOMETRIC' | 'INTEGRATION';
  attendanceCutoffDay: number;
  graceMinutes: number;
  autoLockAttendance: boolean;
  syncEnabled: boolean;
  enableLoanRecovery: boolean;
  enableAdvanceRecovery: boolean;
  defaultDeductionCapPct: number;
  recoveryOrder: string;
};

export type PayrollComponent = {
  id: string;
  clientId: string;
  code: string;
  name: string;
  componentType: string;
  isTaxable: boolean;
  affectsPfWage: boolean;
  affectsEsiWage: boolean;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
};

export type ComponentRule = {
  id: string;
  componentId: string;
  ruleType: string;
  baseComponent: string | null;
  percentage: number | null;
  fixedAmount: number | null;
  formula: string | null;
  priority: number;
  isActive: boolean;
  slabs?: ComponentSlab[];
};

export type ComponentSlab = {
  id?: string;
  ruleId?: string;
  fromAmount: number;
  toAmount: number | null;
  slabPct: number | null;
  slabFixed: number | null;
};

@Injectable({ providedIn: 'root' })
export class PayrollSetupApiService {
  private base = `${environment.apiBaseUrl}/api/v1/payroll/setup`;
  private runBase = `${environment.apiBaseUrl}/api/v1/payroll/runs`;

  constructor(private http: HttpClient) {}

  getSetup(clientId: string): Observable<any> {
    return this.http.get(`${this.base}/${clientId}`);
  }

  saveSetup(clientId: string, body: Partial<PayrollClientSetup>): Observable<any> {
    return this.http.post(`${this.base}/${clientId}`, body);
  }

  listComponents(clientId: string, type?: string): Observable<PayrollComponent[]> {
    let p = new HttpParams();
    if (type) p = p.set('type', type);
    return this.http.get<any>(`${this.base}/${clientId}/components`, { params: p }).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? [])),
    );
  }

  createComponent(clientId: string, body: Partial<PayrollComponent>): Observable<PayrollComponent> {
    return this.http.post<PayrollComponent>(`${this.base}/${clientId}/components`, body);
  }

  updateComponent(clientId: string, componentId: string, body: Partial<PayrollComponent>): Observable<PayrollComponent> {
    return this.http.put<PayrollComponent>(`${this.base}/${clientId}/components/${componentId}`, body);
  }

  deleteComponent(clientId: string, componentId: string): Observable<any> {
    return this.http.delete(`${this.base}/${clientId}/components/${componentId}`);
  }

  listRules(clientId: string, componentId: string): Observable<ComponentRule[]> {
    return this.http.get<any>(`${this.base}/${clientId}/components/${componentId}/rules`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? [])),
    );
  }

  createRule(clientId: string, componentId: string, body: Partial<ComponentRule>): Observable<ComponentRule> {
    return this.http.post<ComponentRule>(`${this.base}/${clientId}/components/${componentId}/rules`, body);
  }

  deleteRule(clientId: string, componentId: string, ruleId: string): Observable<any> {
    return this.http.delete(`${this.base}/${clientId}/components/${componentId}/rules/${ruleId}`);
  }

  // ── Processing ──────────────────────────────────────────

  uploadBreakup(runId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.runBase}/${runId}/upload-breakup`, formData);
  }

  processRun(runId: string): Observable<any> {
    return this.http.post(`${this.runBase}/${runId}/process`, {});
  }

  processWithEngine(runId: string): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/api/v1/payroll/engine/runs/${runId}/process`, {});
  }

  generatePfEcr(runId: string): Observable<Blob> {
    return this.http.post(`${this.runBase}/${runId}/generate/pf-ecr`, {}, { responseType: 'blob' });
  }

  generateEsi(runId: string): Observable<Blob> {
    return this.http.post(`${this.runBase}/${runId}/generate/esi`, {}, { responseType: 'blob' });
  }

  generateRegister(runId: string, stateCode: string, registerType: string): Observable<any> {
    return this.http.post(
      `${this.runBase}/${runId}/generate/registers?stateCode=${stateCode}&registerType=${registerType}`,
      {},
    );
  }

  // ── Approval Workflow ──────────────────────────────────

  submitRunForApproval(runId: string): Observable<any> {
    return this.http.post(`${this.runBase}/${runId}/submit`, {});
  }

  approveRun(runId: string, comments?: string): Observable<any> {
    return this.http.post(`${this.runBase}/${runId}/approve`, { comments });
  }

  rejectRun(runId: string, reason: string): Observable<any> {
    return this.http.post(`${this.runBase}/${runId}/reject`, { reason });
  }

  revertRunToDraft(runId: string): Observable<any> {
    return this.http.post(`${this.runBase}/${runId}/revert`, {});
  }

  getApprovalStatus(runId: string): Observable<any> {
    return this.http.get(`${this.runBase}/${runId}/approval-status`);
  }
}
