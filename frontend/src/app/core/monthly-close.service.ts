import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type CloseArea = 'attendance' | 'payroll' | 'documents' | 'returns';
export interface CloseIssue {
  id: string; title: string; reason: string; owner: string;
  sourceId: string | null; dueDate: string | null;
}
export interface CloseStage {
  area: CloseArea; title: string;
  state: 'REVIEW' | 'RECORDED_CLEAR' | 'UNKNOWN' | 'UNAVAILABLE';
  total: number; outstanding: number; description: string;
  issues: CloseIssue[]; truncated: boolean;
}
export interface MonthlyCloseResponse {
  clientId: string; branchId: string; branchName: string; month: string;
  generatedAt: string; stages: CloseStage[]; outstanding: number;
  needsVerification: boolean; note: string;
}
export interface CloseClient { id: string; clientName: string }
export interface CloseBranch { id: string; branchName: string }

@Injectable({ providedIn: 'root' })
export class MonthlyCloseService {
  private readonly url = `${environment.apiBaseUrl}/api/v1/monthly-close`;
  constructor(private readonly http: HttpClient) {}
  clients() { return this.http.get<{ clients: CloseClient[] }>(`${this.url}/options`); }
  branches(clientId: string) {
    return this.http.get<{ branches: CloseBranch[] }>(`${this.url}/branches`, { params: { clientId } });
  }
  get(clientId: string, branchId: string, month: string) {
    return this.http.get<MonthlyCloseResponse>(this.url, { params: { clientId, branchId, month } });
  }
}
