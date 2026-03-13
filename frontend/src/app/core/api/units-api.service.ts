import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/* ── V2 Types ── */

export interface UnitFacts {
  id?: string;
  branchId: string;
  stateCode: string;
  establishmentType: 'FACTORY' | 'ESTABLISHMENT' | 'BOTH';
  isHazardous: boolean;
  industryCategory: string | null;
  employeeTotal: number;
  employeeMale: number;
  employeeFemale: number;
  contractWorkersTotal: number;
  contractorsCount: number;
  isBocwProject: boolean;
  hasCanteen: boolean | null;
  hasCreche: boolean | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface UnitFactsDto {
  stateCode: string;
  establishmentType: 'FACTORY' | 'ESTABLISHMENT' | 'BOTH';
  isHazardous: boolean;
  industryCategory?: string;
  employeeTotal: number;
  employeeMale?: number;
  employeeFemale?: number;
  contractWorkersTotal?: number;
  contractorsCount?: number;
  isBocwProject?: boolean;
  hasCanteen?: boolean;
  hasCreche?: boolean;
}

export interface ApplicableCompliance {
  id: string;
  branchId: string;
  complianceId: string;
  isApplicable: boolean;
  source: 'AUTO' | 'SPECIAL_SELECTED' | 'OVERRIDE';
  overrideReason: string | null;
  computedBy: string | null;
  computedAt: string;
  compliance: {
    id: string;
    code: string;
    name: string;
    category: string;
    frequency: string;
    appliesTo: string;
  };
}

export interface RecomputeResult {
  computed: number;
  applicable: number;
  results: Array<{
    complianceId: string;
    isApplicable: boolean;
    matchedRule: string | null;
  }>;
}

export interface SaveApplicableDto {
  packageId: string;
  selectedSpecialActCodes?: string[];
  overrides?: Array<{
    complianceId: string;
    isApplicable: boolean;
    reason: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class UnitsApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/units`;

  constructor(private http: HttpClient) {}

  /* ── Facts ── */

  getFacts(branchId: string): Observable<UnitFacts | null> {
    return this.http.get<UnitFacts | null>(`${this.base}/${branchId}/facts`);
  }

  upsertFacts(branchId: string, dto: UnitFactsDto): Observable<UnitFacts> {
    return this.http.put<UnitFacts>(`${this.base}/${branchId}/facts`, dto);
  }

  /* ── Engine ── */

  recompute(branchId: string, packageId: string): Observable<RecomputeResult> {
    return this.http.post<RecomputeResult>(`${this.base}/${branchId}/recompute`, { packageId });
  }

  /* ── Applicable ── */

  getApplicable(branchId: string): Observable<ApplicableCompliance[]> {
    return this.http.get<ApplicableCompliance[]>(`${this.base}/${branchId}/applicable`);
  }

  saveApplicable(branchId: string, dto: SaveApplicableDto): Observable<any> {
    return this.http.put(`${this.base}/${branchId}/applicable`, dto);
  }
}
