import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Holiday {
  id: string;
  clientId: string;
  branchId: string | null;
  stateCode: string | null;
  holidayDate: string;
  name: string;
  isPaid: boolean;
}

export interface HolidayUploadResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface ApplyResult {
  success: boolean;
  holidaysMarked: number;
  created: number;
  updated: number;
}

@Injectable({ providedIn: 'root' })
export class HolidayCalendarService {
  private base = `${environment.apiBaseUrl}/api/v1/client/holidays`;

  constructor(private http: HttpClient) {}

  list(year?: number): Observable<Holiday[]> {
    let p = new HttpParams();
    if (year) p = p.set('year', String(year));
    return this.http.get<Holiday[]>(this.base, { params: p });
  }

  add(body: {
    holidayDate: string;
    name: string;
    branchId?: string | null;
    stateCode?: string | null;
    isPaid?: boolean;
  }): Observable<Holiday> {
    return this.http.post<Holiday>(this.base, body);
  }

  upload(file: File): Observable<HolidayUploadResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<HolidayUploadResult>(`${this.base}/upload`, fd);
  }

  apply(year: number, month: number, branchId?: string): Observable<ApplyResult> {
    return this.http.post<ApplyResult>(`${this.base}/apply`, {
      year,
      month,
      branchId: branchId || undefined,
    });
  }

  remove(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/${id}`);
  }
}
