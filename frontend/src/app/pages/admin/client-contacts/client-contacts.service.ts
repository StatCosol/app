import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type ClientContactDepartment =
  | 'ACCOUNTS'
  | 'COMPLIANCE'
  | 'CONTRACTOR_COMPLIANCE'
  | 'HR'
  | 'PAYROLL';

export interface ClientDepartmentContact {
  id: string;
  clientId: string;
  department: ClientContactDepartment;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactPayload {
  clientId: string;
  department: ClientContactDepartment;
  name: string;
  email: string;
  phone?: string;
  designation?: string;
  isActive?: boolean;
  notes?: string;
}

export interface UpdateContactPayload {
  department?: ClientContactDepartment;
  name?: string;
  email?: string;
  phone?: string;
  designation?: string;
  isActive?: boolean;
  notes?: string;
}

export interface CommRunSummary {
  summary: { total: number; sent: number; skipped: number; failed: number };
  entries: Array<{
    clientId: string;
    clientName: string;
    status: 'SENT' | 'SKIPPED' | 'FAILED';
    reason?: string;
    recipients?: string[];
    cc?: string[];
  }>;
}

@Injectable({ providedIn: 'root' })
export class ClientContactsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/v1/admin/client-contacts`;

  list(clientId: string): Observable<ClientDepartmentContact[]> {
    return this.http.get<ClientDepartmentContact[]>(
      `${this.base}/client/${clientId}`,
    );
  }

  departments(): Observable<ClientContactDepartment[]> {
    return this.http.get<ClientContactDepartment[]>(`${this.base}/departments`);
  }

  create(payload: CreateContactPayload): Observable<ClientDepartmentContact> {
    return this.http.post<ClientDepartmentContact>(this.base, payload);
  }

  update(
    id: string,
    payload: UpdateContactPayload,
  ): Observable<ClientDepartmentContact> {
    return this.http.patch<ClientDepartmentContact>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }

  triggerPayrollNow(clientId?: string): Observable<CommRunSummary> {
    let params = new HttpParams();
    if (clientId) params = params.set('clientId', clientId);
    return this.http.post<CommRunSummary>(
      `${this.base}/trigger/payroll-input`,
      {},
      { params },
    );
  }

  triggerMcdNow(clientId?: string): Observable<CommRunSummary> {
    let params = new HttpParams();
    if (clientId) params = params.set('clientId', clientId);
    return this.http.post<CommRunSummary>(
      `${this.base}/trigger/mcd-request`,
      {},
      { params },
    );
  }

  // ----- Email templates -----
  listTemplates(): Observable<MailTemplate[]> {
    return this.http.get<MailTemplate[]>(`${this.base}/templates`);
  }

  updateTemplate(
    commType: ClientCommType,
    payload: { subjectTemplate: string; bodyTemplate: string },
  ): Observable<{ ok: boolean; error?: string }> {
    return this.http.patch<{ ok: boolean; error?: string }>(
      `${this.base}/templates/${commType}`,
      payload,
    );
  }

  resetTemplate(
    commType: ClientCommType,
  ): Observable<{ ok: boolean; defaults?: { subject: string; body: string } }> {
    return this.http.post<{
      ok: boolean;
      defaults?: { subject: string; body: string };
    }>(`${this.base}/templates/${commType}/reset`, {});
  }

  previewTemplate(
    commType: ClientCommType,
    payload?: {
      subjectTemplate?: string;
      bodyTemplate?: string;
      clientName?: string;
      monthLabel?: string;
      deadlineLabel?: string;
      portalUrl?: string;
    },
  ): Observable<{
    ok: boolean;
    subject?: string;
    body?: string;
    source?: 'DB' | 'DEFAULT';
    placeholders?: string[];
    error?: string;
  }> {
    return this.http.post(
      `${this.base}/templates/${commType}/preview`,
      payload || {},
    ) as Observable<{
      ok: boolean;
      subject?: string;
      body?: string;
      source?: 'DB' | 'DEFAULT';
      placeholders?: string[];
      error?: string;
    }>;
  }
}

export type ClientCommType = 'PAYROLL_INPUT_REQUEST' | 'MCD_REQUEST';

export interface MailTemplate {
  commType: ClientCommType;
  subjectTemplate: string;
  bodyTemplate: string;
  defaultSubject: string;
  defaultBody: string;
  isCustom: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  placeholders: string[];
}
