import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CtcBranchRow {
  branch_id: string;
  branch_name: string;
  total_employees: number;
  gross_total: number;
  pf_employee: number;
  pf_employer: number;
  esi_employee: number;
  esi_employer: number;
  pt_total: number;
  bonus_total: number;
  other_employer_cost: number;
  employer_cost_total: number;
  net_pay_total: number;
  monthly_ctc: number;
}

export interface CtcConsolidated {
  totalEmployees: number;
  grossTotal: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  ptTotal: number;
  bonusTotal: number;
  otherEmployerCost: number;
  employerCostTotal: number;
  netPayTotal: number;
  monthlyCTC: number;
  annualCTC: number;
}

export interface ClientCtcResponse {
  year: number;
  month: number | null;
  consolidated: CtcConsolidated;
  branches: CtcBranchRow[];
}

export interface BranchCtcResponse {
  year: number;
  month: number | null;
  summary: CtcConsolidated;
}

export interface MonthlyTrendRow {
  month: number;
  total_employees: number;
  gross_total: number;
  employer_cost_total: number;
  net_pay_total: number;
  monthly_ctc: number;
}

@Injectable({ providedIn: 'root' })
export class CtcSummaryService {
  private base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  /* ─── Client endpoints ─── */
  clientSummary(year: number, month?: number): Observable<ClientCtcResponse> {
    let params = new HttpParams().set('year', year);
    if (month) params = params.set('month', month);
    return this.http.get<ClientCtcResponse>(`${this.base}/client/payroll/ctc-summary`, { params });
  }

  clientYtd(year: number): Observable<CtcConsolidated> {
    return this.http.get<CtcConsolidated>(`${this.base}/client/payroll/ctc-summary/ytd`, {
      params: new HttpParams().set('year', year),
    });
  }

  clientTrend(year: number): Observable<MonthlyTrendRow[]> {
    return this.http.get<MonthlyTrendRow[]>(`${this.base}/client/payroll/ctc-summary/trend`, {
      params: new HttpParams().set('year', year),
    });
  }

  /* ─── Branch endpoints ─── */
  branchSummary(year: number, month?: number): Observable<BranchCtcResponse> {
    let params = new HttpParams().set('year', year);
    if (month) params = params.set('month', month);
    return this.http.get<BranchCtcResponse>(`${this.base}/branch/payroll/ctc`, { params });
  }

  branchYtd(year: number): Observable<CtcConsolidated> {
    return this.http.get<CtcConsolidated>(`${this.base}/branch/payroll/ctc/ytd`, {
      params: new HttpParams().set('year', year),
    });
  }

  branchTrend(year: number): Observable<MonthlyTrendRow[]> {
    return this.http.get<MonthlyTrendRow[]>(`${this.base}/branch/payroll/ctc/trend`, {
      params: new HttpParams().set('year', year),
    });
  }
}
