import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ComplianceScheduleEntry {
  code: string;
  name: string;
  module: string;
  frequency: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate?: string;
  windowOpen?: string;
  windowClose?: string;
  ruleId: string;
}

export interface BranchComplianceResponse {
  branchId: string;
  branchName: string;
  stateCode: string;
  establishmentType: string;
  month: string;
  items: ComplianceScheduleEntry[];
}

@Injectable({ providedIn: 'root' })
export class BranchComplianceService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/branches`;

  constructor(private http: HttpClient) {}

  getComplianceItems(branchId: string, month: string): Observable<BranchComplianceResponse> {
    const params = new HttpParams().set('month', month);
    return this.http.get<BranchComplianceResponse>(
      `${this.base}/${branchId}/compliance-items`,
      { params },
    );
  }
}
