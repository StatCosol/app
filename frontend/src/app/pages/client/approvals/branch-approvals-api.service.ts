import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../../../core/interceptors/error.interceptor';

export interface PendingNomination {
  id: string;
  employeeId: string;
  employeeName?: string;
  nominationType: string;
  status: string;
  declarationDate?: string;
  witnessName?: string;
  witnessAddress?: string;
  submittedAt?: string;
  members?: { memberName: string; relationship: string; sharePct: number; isMinor: boolean }[];
}

export interface PendingLeave {
  id: string;
  employeeId: string;
  employeeName?: string;
  leaveTypeCode: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason?: string;
  status: string;
  appliedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class BranchApprovalsApiService {
  private base = 'api/v1/branch-approvals';

  constructor(private http: HttpClient) {}

  // ── Nominations ─────────────────────────────────────
  listPendingNominations(branchId?: string): Observable<PendingNomination[]> {
    const params: any = {};
    if (branchId) params.branchId = branchId;
    return this.http.get<PendingNomination[]>(`${this.base}/nominations`, {
      params,
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  approveNomination(id: string): Observable<any> {
    return this.http.put(`${this.base}/nominations/${id}/approve`, {});
  }

  rejectNomination(id: string, reason: string): Observable<any> {
    return this.http.put(`${this.base}/nominations/${id}/reject`, { reason });
  }

  // ── Leave Applications ──────────────────────────────
  listPendingLeaves(branchId?: string): Observable<PendingLeave[]> {
    const params: any = {};
    if (branchId) params.branchId = branchId;
    return this.http.get<PendingLeave[]>(`${this.base}/leaves`, {
      params,
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  approveLeave(id: string): Observable<any> {
    return this.http.put(`${this.base}/leaves/${id}/approve`, {});
  }

  rejectLeave(id: string, reason: string): Observable<any> {
    return this.http.put(`${this.base}/leaves/${id}/reject`, { reason });
  }
}
