import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminPayrollClientSettingRecord {
  id: string;
  clientId: string;
  settings: Record<string, any>;
  updatedBy: string | null;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminPayrollClientSettingsService {
  private readonly base = '/api/v1/admin/payroll';

  constructor(private readonly http: HttpClient) {}

  getClientSettingsList(): Observable<{ items: AdminPayrollClientSettingRecord[] }> {
    return this.http.get<{ items: AdminPayrollClientSettingRecord[] }>(
      `${this.base}/client-settings`,
    );
  }

  getClientSettings(clientId: string): Observable<AdminPayrollClientSettingRecord | null> {
    return this.http.get<AdminPayrollClientSettingRecord | null>(
      `${this.base}/client-settings/${clientId}`,
    );
  }

  updateClientSettings(
    clientId: string,
    payload: { settings: Record<string, any>; updated_by?: string },
  ): Observable<AdminPayrollClientSettingRecord> {
    return this.http.post<AdminPayrollClientSettingRecord>(
      `${this.base}/client-settings/${clientId}`,
      payload,
    );
  }

  getClients(): Observable<any> {
    return this.http.get('/api/v1/admin/clients');
  }
}

