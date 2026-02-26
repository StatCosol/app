import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LeavePolicy {
  id: string;
  clientId: string;
  branchId: string | null;
  leaveType: string;
  leaveName: string;
  accrualMethod: string;
  accrualRate: string;
  carryForwardLimit: string;
  yearlyLimit: string;
  allowNegative: boolean;
  minNoticeDays: number;
  maxDaysPerRequest: string;
  requiresDocument: boolean;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class LeaveManagementService {
  private base = 'api/v1/leave-management';

  constructor(private http: HttpClient) {}

  listPolicies(): Observable<LeavePolicy[]> {
    return this.http.get<LeavePolicy[]>(`${this.base}/policies`);
  }

  createPolicy(body: Partial<LeavePolicy>): Observable<LeavePolicy> {
    return this.http.post<LeavePolicy>(`${this.base}/policies`, body);
  }

  updatePolicy(id: string, body: Partial<LeavePolicy>): Observable<LeavePolicy> {
    return this.http.put<LeavePolicy>(`${this.base}/policies/${id}`, body);
  }

  seedDefaults(): Observable<any> {
    return this.http.post(`${this.base}/seed-defaults`, {});
  }

  initializeBalances(year?: number): Observable<any> {
    return this.http.post(`${this.base}/initialize-balances`, { year });
  }
}
