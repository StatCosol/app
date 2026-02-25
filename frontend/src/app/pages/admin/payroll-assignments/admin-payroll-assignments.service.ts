import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface PayrollAssignment {
  id: string;
  clientId: string;
  payrollUserId: string;
  clientName?: string;
  payrollUserName?: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  status?: string;
}

export interface CreatePayrollAssignmentPayload {
  clientId: string;
  payrollUserId: string;
}

@Injectable({ providedIn: 'root' })
export class AdminPayrollAssignmentsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl}/api/v1`;
  private payrollAssignmentsBase = `${environment.apiBaseUrl}/api/v1/admin/payroll-assignments`;

  getClients(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/clients`);
  }

  getPayrollUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/users?role=PAYROLL`);
  }

  /**
   * Backend: GET /api/admin/payroll-assignments/:clientId
   */
  getCurrentAssignment(clientId: string): Observable<PayrollAssignment | null> {
    return this.http.get<PayrollAssignment | null>(`${this.payrollAssignmentsBase}/${clientId}`);
  }

  /**
   * Backend: POST /api/admin/payroll-assignments
   */
  createAssignment(payload: CreatePayrollAssignmentPayload): Observable<PayrollAssignment> {
    return this.http.post<PayrollAssignment>(`${this.payrollAssignmentsBase}`, payload);
  }

  /**
   * Backend: DELETE /api/admin/payroll-assignments/:clientId
   */
  unassign(clientId: string): Observable<any> {
    return this.http.delete(`${this.payrollAssignmentsBase}/${clientId}`);
  }
}
