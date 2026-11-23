import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type RequestScope = 'ACTUAL' | 'TEST';
export type RegistrationRequestAction = 'APPLY' | 'RENEW' | 'AMEND' | 'CLOSE';
export interface RenewalOption { id: string; type: string; authority: string | null; registrationNumber: string | null; expiryDate: string | null; }
export type ReviewAction = 'REVIEW' | 'CORRECTION' | 'RESUBMIT' | 'APPROVE';
export interface RegistrationTicket {
  id: string; branchId: string; clientId: string; isTest: boolean;
  status: string; description: string; subCategory: string; createdAt: string; updatedAt: string;
}
export interface RegistrationDetail {
  ticket: RegistrationTicket;
  messages: { id: string; message: string; senderName?: string; senderRole?: string; createdAt: string }[];
}
@Injectable({ providedIn: 'root' })
export class RegistrationRequestsApi {
  private base = `${environment.apiBaseUrl}/api/v1/registration-requests`;
  constructor(private http: HttpClient) {}
  list(branchId: string, recordScope: RequestScope, clientId = '') {
    return this.http.get<RegistrationTicket[]>(this.base, { params: { branchId, recordScope, ...(clientId ? { clientId } : {}) } });
  }
  renewalOptions(branchId: string, recordScope: RequestScope) {
    return this.http.get<RenewalOption[]>(`${this.base}/renewal-options`, { params: { branchId, recordScope } });
  }
  detail(id: string) { return this.http.get<RegistrationDetail>(`${this.base}/${id}`); }
  create(body: { action?: RegistrationRequestAction; registrationId?: string; branchId: string; recordScope: RequestScope; registrationType: string; authority: string; notes: string }) {
    return this.http.post<RegistrationTicket>(this.base, body);
  }
  action(ticket: RegistrationTicket, recordScope: RequestScope, action: ReviewAction, remarks: string) {
    return this.http.post<RegistrationTicket>(`${this.base}/${ticket.id}/actions`, { recordScope, action, remarks, expectedStatus: ticket.status });
  }
}
