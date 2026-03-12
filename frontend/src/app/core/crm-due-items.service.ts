import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { DueItemRow, DueKpis } from '../shared/models/crm-due-items.model';

export type CrmAmendmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED';

@Injectable({ providedIn: 'root' })
export class CrmDueItemsService {
  private readonly base = `${environment.apiBaseUrl || ''}/api/v1/crm/due-items`;
  private readonly amendmentsBase = `${environment.apiBaseUrl || ''}/api/v1/crm/amendments`;

  constructor(private http: HttpClient) {}

  getKpis(params: Record<string, string | undefined>): Observable<DueKpis> {
    return this.http.get<DueKpis>(`${this.base}/kpis`, { params: this.clean(params) });
  }

  list(params: Record<string, any>): Observable<{ items: DueItemRow[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${this.base}`, { params: this.clean(params) }).pipe(
      map((res: any) => ({
        items: res?.items || res?.data || res || [],
        total: res?.total ?? 0,
        page: res?.page ?? 1,
        limit: res?.limit ?? 10,
      })),
    );
  }

  approve(id: string, remarks?: string) {
    return this.http.post(`${this.base}/${id}/approve`, { remarks });
  }

  reject(id: string, remarks: string) {
    return this.http.post(`${this.base}/${id}/reject`, { remarks });
  }

  requestFromBranch(
    id: string,
    message: string,
    action: 'RETURN' | 'REMINDER' | 'OWNER' | 'NOTE' = 'RETURN',
    extra?: { owner?: string },
  ) {
    return this.http.post(`${this.base}/${id}/request`, { message, action, ...extra });
  }

  getAmendment(id: string) {
    return this.http.get<any>(`${this.amendmentsBase}/${id}`);
  }

  updateAmendmentStatus(
    id: string,
    status: CrmAmendmentStatus,
    reason?: string | null,
  ) {
    return this.http.put(`${this.amendmentsBase}/${id}/status`, { status, reason: reason || null });
  }

  addAmendmentComment(id: string, message: string) {
    return this.http.post(`${this.amendmentsBase}/${id}/comments`, { message });
  }

  private clean(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return p;
  }
}
