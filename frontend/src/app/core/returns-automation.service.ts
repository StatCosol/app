import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FilingGenerationResult {
  filingsCreated: number;
  tasksCreated: number;
  skipped: number;
}

export interface OverdueAlertResult {
  alertsSent: number;
}

@Injectable({ providedIn: 'root' })
export class ReturnsAutomationService {
  private base = `${environment.apiBaseUrl}/api/v1/automation/returns-filing`;

  constructor(private http: HttpClient) {}

  generateFilings(year?: number, month?: number): Observable<FilingGenerationResult> {
    let params = new HttpParams();
    if (year) params = params.set('year', String(year));
    if (month) params = params.set('month', String(month));
    return this.http.post<FilingGenerationResult>(`${this.base}/generate`, null, { params });
  }

  generateRenewals(): Observable<FilingGenerationResult> {
    return this.http.post<FilingGenerationResult>(`${this.base}/generate-renewals`, null);
  }

  sendOverdueAlerts(): Observable<OverdueAlertResult> {
    return this.http.post<OverdueAlertResult>(`${this.base}/overdue-alerts`, null);
  }
}
