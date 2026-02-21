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

@Injectable({ providedIn: 'root' })
export class PayrollRegistersService {
  private base = `${environment.apiBaseUrl}/api/payroll`;

  constructor(private http: HttpClient) {}

  listRegisters(q: {
    clientId?: string;
    branchId?: string;
    category?: string;
    periodYear?: number;
    periodMonth?: number;
  }): Observable<RegisterRecordRow[]> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.branchId) p = p.set('branchId', q.branchId);
    if (q.category) p = p.set('category', q.category);
    if (q.periodYear) p = p.set('periodYear', String(q.periodYear));
    if (q.periodMonth) p = p.set('periodMonth', String(q.periodMonth));

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
          approvalStatus: r?.approvalStatus ?? r?.approval_status ?? 'PENDING',
          approvedAt: r?.approvedAt ?? r?.approved_at ?? null,
        })) as RegisterRecordRow[];
      }),
    );
  }

  downloadRegister(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/registers/${id}/download`, { responseType: 'blob' });
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
}
