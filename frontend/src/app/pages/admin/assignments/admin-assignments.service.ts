import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface CreateAssignmentPayload {
  clientId: string;
  crmId?: string | null;
  auditorId?: string | null;
}

export interface Assignment {
  id?: string;
  clientId: string;
  crm?: string | null;
  auditor?: string | null;
  // Legacy support for older payload shapes
  crmId?: string | null;
  auditorId?: string | null;
  clientName?: string;
  crmName?: string;
  auditorName?: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'ASSIGNED' | 'PENDING' | 'HISTORY';
}

@Injectable({
  providedIn: 'root',
})
export class AdminAssignmentsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl}/api/v1`;

  getClients(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/clients`);
  }

  getCrms(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/users?role=CRM`);
  }

  getAuditors(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/users?role=AUDITOR`);
  }

  createAssignment(payload: CreateAssignmentPayload): Observable<Assignment> {
    return this.http.post<Assignment>(
      `${this.apiUrl}/admin/assignments`,
      payload
    );
  }

  getAssignments(): Observable<Assignment[]> {
    return this.http.get<Assignment[]>(
      `${this.apiUrl}/admin/assignments`,
    );
  }

  getCurrentAssignments(): Observable<Assignment[]> {
    return this.getAssignments();
  }

  getAssignmentHistory(clientId?: string): Observable<Assignment[]> {
    const url = clientId
      ? `${this.apiUrl}/admin/assignments/history?clientId=${clientId}`
      : `${this.apiUrl}/admin/assignments/history`;
    return this.http.get<Assignment[]>(url);
  }

  updateAssignment(clientId: string, payload: Partial<CreateAssignmentPayload>): Observable<Assignment> {
    return this.http.put<Assignment>(
      `${this.apiUrl}/admin/assignments/${clientId}`,
      payload,
    );
  }

  /**
   * Backend delete endpoint is keyed by clientId (not assignmentId).
   * Keep this method for legacy callers.
   */
  deleteAssignment(clientId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/admin/assignments/${clientId}`);
  }

  unassignClient(clientId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/assignments/${clientId}`);
  }

  // ADMIN override endpoints for per-client CRM / Auditor
  overrideCrm(clientId: string, crmId: string | null) {
    return this.http.post<any>(
      `${this.apiUrl}/admin/assignments/clients/${clientId}/assignments/change`,
      {
        assignmentType: 'CRM',
        assignedToUserId: crmId,
        changeReason: 'MANUAL_OVERRIDE',
      },
    );
  }

  overrideAuditor(clientId: string, auditorId: string | null) {
    return this.http.post<any>(
      `${this.apiUrl}/admin/assignments/clients/${clientId}/assignments/change`,
      {
        assignmentType: 'AUDITOR',
        assignedToUserId: auditorId,
        changeReason: 'MANUAL_OVERRIDE',
      },
    );
  }
}
