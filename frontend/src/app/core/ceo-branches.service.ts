import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { CeoBranchRow, CeoBranchDetail } from '../shared/models/ceo-branches.model';

@Injectable({ providedIn: 'root' })
export class CeoBranchesService {
  private readonly base = `${environment.apiBaseUrl || ''}/api/v1/ceo/branches`;

  constructor(private http: HttpClient) {}

  list(
    month: string,
    q?: string,
    filters?: { state?: string; client?: string; riskBand?: 'LOW' | 'MEDIUM' | 'HIGH' },
  ): Observable<{ items: CeoBranchRow[]; total: number }> {
    let p = new HttpParams().set('month', month);
    if (q) p = p.set('q', q);
    if (filters?.state) p = p.set('state', filters.state);
    if (filters?.client) p = p.set('client', filters.client);
    if (filters?.riskBand) p = p.set('riskBand', filters.riskBand);
    return this.http.get<any>(this.base, { params: p }).pipe(
      map((res: any) => ({
        items: (res?.items || res?.data || res || []).map((row: any) => ({
          branchId: row?.branchId || row?.branch_id || row?.id,
          branchName: row?.branchName || row?.branch_name || '-',
          clientName: row?.clientName || row?.client_name || '-',
          state: row?.state || '-',
          compliancePercent: Number(row?.compliancePercent ?? row?.compliance_percent ?? 0),
          overdueCount: Number(row?.overdueCount ?? row?.overdue_count ?? 0),
          auditScore: Number(row?.auditScore ?? row?.audit_score ?? 0),
          riskExposureScore: Number(row?.riskExposureScore ?? row?.risk_exposure_score ?? 0),
        })),
        total: res?.total ?? 0,
      })),
    );
  }

  detail(branchId: string, month: string): Observable<CeoBranchDetail> {
    return this.http.get<CeoBranchDetail>(`${this.base}/${branchId}`, {
      params: new HttpParams().set('month', month),
    });
  }

  exportReport(type: string, month: string): Observable<Blob> {
    return this.http.get(`${environment.apiBaseUrl || ''}/api/v1/ceo/reports/${type}`, {
      params: new HttpParams().set('month', month),
      responseType: 'blob',
    });
  }
}
