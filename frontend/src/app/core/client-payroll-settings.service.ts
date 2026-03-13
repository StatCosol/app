import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ClientPayrollAccessSettings = {
  clientId: string;
  allowBranchPayrollAccess: boolean;
  allowBranchWageRegisters: boolean;
  allowBranchSalaryRegisters: boolean;
};

@Injectable({ providedIn: 'root' })
export class ClientPayrollSettingsService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  get(): Observable<ClientPayrollAccessSettings> {
    return this.http.get<ClientPayrollAccessSettings>(`${this.baseUrl}/api/v1/client/payroll/settings`);
  }

  update(dto: Partial<ClientPayrollAccessSettings>): Observable<ClientPayrollAccessSettings> {
    return this.http.post<ClientPayrollAccessSettings>(`${this.baseUrl}/api/v1/client/payroll/settings`, dto);
  }
}
