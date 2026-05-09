import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AiRiskInputs {
  mcdUploaded: boolean;
  mcdPercent: number;
  returnsPending: number;
  pfNotRegisteredEmployees: number;
  esiApplicableButNotRegistered: number;
  daysPendingAverage: number;
  contractorUploadPercentage: number;
  auditCriticalNC: number;
  auditHighNC: number;
  auditMediumNC: number;
}

export interface AiRiskBranchResponse {
  branchId: string;
  branchName: string;
  period: string;
  inputs: AiRiskInputs;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  inspectionProbability: number;
  keyFindings: string[];
  recommendedActions: string[];
  /** Convenience fields computed from inputs for UI display */
  mcdPercent: number;
  contractorUploadPercentage: number;
  auditNcCount: number;
}

@Injectable({ providedIn: 'root' })
export class AiRiskApi {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getBranchRisk(branchId: string, year: number, month: number): Observable<AiRiskBranchResponse> {
    return this.http.get<AiRiskBranchResponse>(
      `${this.baseUrl}/api/v1/ai/risk/branch/${branchId}`,
      { params: { year: year.toString(), month: month.toString() } },
    );
  }
}
