import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BranchAuditKpiItem {
  periodCode: string; // YYYY-MM
  critical: number;
  high: number;
  medium: number;
  low: number;
  open: number;
  closed: number;
}

export interface BranchAuditKpiResponse {
  branchId: string;
  from: string;
  to: string;
  items: BranchAuditKpiItem[];
}

@Injectable({ providedIn: 'root' })
export class AuditsKpiApi {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getBranchAuditKpi(branchId: string, from: string, to: string): Observable<BranchAuditKpiResponse> {
    return this.http.get<BranchAuditKpiResponse>(
      `${this.baseUrl}/api/v1/audit-kpi/branch/${branchId}`,
      { params: { from, to } },
    );
  }

  getBranchAuditKpiSingle(branchId: string, periodCode: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/audit-kpi/branch/${branchId}/${periodCode}`);
  }
}
