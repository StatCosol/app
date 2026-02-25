import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type PayrollSummary = {
  assignedClients: number;
  pendingRuns: number;
  completedThisMonth: number;
};

export type PayrollClient = {
  id: string;
  name: string;
  clientName?: string;
  clientCode?: string;
  status?: string;
};

@Injectable({ providedIn: 'root' })
export class PayrollApiService {
  constructor(private http: HttpClient) {}

  /**
   * V1 endpoint (recommended backend): GET /api/payroll/summary
   * If not available yet, we return zeros.
   */
  getSummary(): Observable<PayrollSummary> {
    return this.http.get<any>(`${environment.apiBaseUrl}/api/v1/payroll/summary`).pipe(
      map((r) => {
        return {
          assignedClients: Number(r?.assignedClients ?? 0),
          pendingRuns: Number(r?.pendingRuns ?? 0),
          completedThisMonth: Number(r?.completedThisMonth ?? 0),
        };
      })
    );
  }

  /** V1 endpoint (recommended backend): GET /api/payroll/clients */
  getAssignedClients(): Observable<PayrollClient[]> {
    return this.http.get<any[]>(`${environment.apiBaseUrl}/api/v1/payroll/clients`).pipe(
      map((clients) => {
        return clients.map(c => ({
          id: c.id,
          name: c.clientName || c.name || c.client_name || 'Unknown Client',
          clientName: c.clientName || c.client_name,
          clientCode: c.clientCode || c.client_code,
          status: c.status
        }));
      })
    );
  }
}
