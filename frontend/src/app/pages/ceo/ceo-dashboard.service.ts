import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CeoDashboardData {
  pendingApprovals: number;
  escalations: number;
  overdue: number;
  compliancePending: number;
}

@Injectable({ providedIn: 'root' })
export class CeoDashboardService {
  constructor(private http: HttpClient) {}

  getDashboardData(): Observable<CeoDashboardData> {
    return this.http.get<CeoDashboardData>('/api/ceo/dashboard');
  }
}
