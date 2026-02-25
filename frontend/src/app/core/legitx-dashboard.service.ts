import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { LegitxDashboardResponse, LegitxToggle } from '../pages/client/dashboard/legitx-dashboard.dto';

@Injectable({ providedIn: 'root' })
export class LegitxDashboardService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getSummary(params: {
    month: number;
    year: number;
    branchId?: string | number | null;
    contractorId?: string | number | null;
    toggle?: LegitxToggle;
  }): Observable<LegitxDashboardResponse> {
    let httpParams = new HttpParams()
      .set('month', params.month.toString())
      .set('year', params.year.toString());

    if (params.branchId !== undefined && params.branchId !== null && params.branchId !== 'ALL') {
      httpParams = httpParams.set('branchId', String(params.branchId));
    }

    if (params.contractorId !== undefined && params.contractorId !== null && params.contractorId !== 'ALL') {
      httpParams = httpParams.set('contractorId', String(params.contractorId));
    }

    if (params.toggle && params.toggle !== 'ALL') {
      httpParams = httpParams.set('toggle', params.toggle);
    }

    return this.http.get<LegitxDashboardResponse>(`${this.baseUrl}/api/v1/legitx/dashboard/summary`, {
      params: httpParams,
    });
  }
}