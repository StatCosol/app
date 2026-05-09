import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MinimumWageSkill =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

export interface MinimumWageRow {
  id: string;
  stateCode: string;
  skillCategory: MinimumWageSkill;
  scheduledEmployment: string | null;
  monthlyWage: number;
  dailyWage: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertWagePayload {
  stateCode: string;
  skillCategory: MinimumWageSkill;
  scheduledEmployment?: string | null;
  monthlyWage: number;
  dailyWage?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  source?: string | null;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CrmMinimumWagesService {
  private readonly base = `${environment.apiBaseUrl || ''}/api/v1/minimum-wages`;

  constructor(private http: HttpClient) {}

  list(filters?: {
    stateCode?: string;
    skillCategory?: string;
    scheduledEmployment?: string;
  }): Observable<{ data: MinimumWageRow[]; total: number }> {
    let params = new HttpParams();
    if (filters?.stateCode) params = params.set('stateCode', filters.stateCode);
    if (filters?.skillCategory)
      params = params.set('skillCategory', filters.skillCategory);
    if (filters?.scheduledEmployment)
      params = params.set('scheduledEmployment', filters.scheduledEmployment);
    return this.http.get<{ data: MinimumWageRow[]; total: number }>(this.base, {
      params,
    });
  }

  create(payload: UpsertWagePayload): Observable<MinimumWageRow> {
    return this.http.post<MinimumWageRow>(this.base, payload);
  }

  update(
    id: string,
    payload: Partial<UpsertWagePayload>,
  ): Observable<MinimumWageRow> {
    return this.http.put<MinimumWageRow>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
}
