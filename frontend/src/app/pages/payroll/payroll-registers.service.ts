import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, map } from 'rxjs';

export type RegisterRecordRow = {
  id: string;
  clientId: string;
  clientName?: string | null;
  branchId?: string | null;
  category: string;
  title: string;
  registerType?: string | null;
  stateCode?: string | null;
  periodYear?: number | null;
  periodMonth?: number | null;
  fileName?: string | null;
  fileType?: string | null;
  approvalStatus?: string;
  approvedAt?: string | null;
};

export type BranchTemplateInfo = {
  branchId: string;
  branchName: string;
  branchType: string;
  establishmentCategory: string;
  stateCode: string;
  templates: {
    id: string;
    registerType: string;
    title: string;
    description: string | null;
    establishmentType: string;
    stateCode: string;
  }[];
};

@Injectable({ providedIn: 'root' })
export class PayrollRegistersService {
  private base = `${environment.apiBaseUrl}/api/v1/payroll`;

  constructor(private http: HttpClient) {}

  listRegisters(q: {
    clientId?: string;
    branchId?: string;
    category?: string;
    periodYear?: number;
    periodMonth?: number;
    registerType?: string;
  }): Observable<RegisterRecordRow[]> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.branchId) p = p.set('branchId', q.branchId);
    if (q.category) p = p.set('category', q.category);
    if (q.periodYear) p = p.set('periodYear', String(q.periodYear));
    if (q.periodMonth) p = p.set('periodMonth', String(q.periodMonth));
    if (q.registerType) p = p.set('registerType', q.registerType);

    return this.http.get<any>(`${this.base}/registers`, { params: p }).pipe(
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return (arr || []).map((r: any) => ({
          id: String(r?.id ?? ''),
          clientId: String(r?.clientId ?? r?.client_id ?? ''),
          clientName: r?.clientName ?? r?.client_name ?? null,
          branchId: r?.branchId ?? r?.branch_id ?? null,
          category: String(r?.category ?? ''),
          title: String(r?.title ?? ''),
          registerType: r?.registerType ?? r?.register_type ?? null,
          stateCode: r?.stateCode ?? r?.state_code ?? null,
          periodYear: r?.periodYear ?? r?.period_year ?? null,
          periodMonth: r?.periodMonth ?? r?.period_month ?? null,
          fileName: r?.fileName ?? r?.file_name ?? null,
          fileType: r?.fileType ?? r?.file_type ?? null,
          approvalStatus: (r?.approvalStatus ?? r?.approval_status ?? 'PENDING').toUpperCase(),
          approvedAt: r?.approvedAt ?? r?.approved_at ?? null,
        })) as RegisterRecordRow[];
      }),
    );
  }

  downloadRegister(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/registers/${id}/download`, { responseType: 'blob' });
  }

  downloadRegistersPack(q: {
    clientId?: string;
    branchId?: string;
    periodYear?: number;
    periodMonth?: number;
    registerType?: string;
  }): Observable<Blob> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.branchId) p = p.set('branchId', q.branchId);
    if (q.periodYear) p = p.set('periodYear', String(q.periodYear));
    if (q.periodMonth) p = p.set('periodMonth', String(q.periodMonth));
    if (q.registerType) p = p.set('registerType', q.registerType);
    return this.http.get(`${this.base}/registers/download-pack`, { params: p, responseType: 'blob' });
  }

  approveRegister(id: string): Observable<any> {
    return this.http.patch(`${this.base}/registers/${id}/approve`, {});
  }

  rejectRegister(id: string, reason?: string): Observable<any> {
    return this.http.patch(`${this.base}/registers/${id}/reject`, { reason: reason ?? '' });
  }

  saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  getApplicableTemplates(branchId: string): Observable<BranchTemplateInfo> {
    return this.http.get<BranchTemplateInfo>(
      `${this.base}/runs/register-templates/branch/${branchId}`,
    );
  }

  generateAllRegisters(
    runId: string,
    branchId: string,
  ): Observable<{ generated: any[]; skipped: string[] }> {
    return this.http.post<{ generated: any[]; skipped: string[] }>(
      `${this.base}/runs/${runId}/generate/all-registers?branchId=${encodeURIComponent(branchId)}`,
      {},
    );
  }

  getPayrollRuns(clientId?: string): Observable<any[]> {
    let p = new HttpParams();
    if (clientId) p = p.set('clientId', clientId);
    return this.http.get<any>(`${this.base}/runs`, { params: p }).pipe(
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return arr || [];
      }),
    );
  }
}
