import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface AdminDigestHistoryItem {
  id: number;
  digestType: 'WEEKLY' | 'CRITICAL';
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  source: string;
  triggeredBy: string | null;
  recipientsCount: number;
  summary: Record<string, any> | null;
  errorMessage: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminDigestApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/admin/reminders`;

  constructor(private readonly http: HttpClient) {}

  getConfig(): Observable<any> {
    return this.http.get(`${this.baseUrl}/config`);
  }

  getPreview(): Observable<any> {
    return this.http.get(`${this.baseUrl}/preview`);
  }

  getHistory(limit = 30): Observable<{ items: AdminDigestHistoryItem[] }> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<{ items: AdminDigestHistoryItem[] }>(`${this.baseUrl}/history`, { params });
  }

  sendNow(): Observable<any> {
    return this.http.post(`${this.baseUrl}/send-now`, {});
  }

  sendCritical(): Observable<any> {
    return this.http.post(`${this.baseUrl}/send-critical`, {});
  }
}
