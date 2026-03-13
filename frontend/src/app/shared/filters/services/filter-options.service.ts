import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClientOption, BranchOption } from '../models/filter.model';

/**
 * Fetches the allowed client/branch options for the logged-in user,
 * scoped to their role and assignments.
 */
@Injectable({ providedIn: 'root' })
export class FilterOptionsService {
  constructor(private http: HttpClient) {}

  // ── Admin ──
  adminClients(): Observable<ClientOption[]> {
    return this.http.get<ClientOption[]>('/api/v1/admin/options/clients');
  }
  adminBranches(clientId: string): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>('/api/v1/admin/options/branches', { params: { clientId } });
  }

  // ── CRM ──
  crmClients(): Observable<ClientOption[]> {
    return this.http.get<ClientOption[]>('/api/v1/crm/options/clients');
  }
  crmBranches(clientId: string): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>('/api/v1/crm/options/branches', { params: { clientId } });
  }

  // ── LegitX (Client portal) ──
  clientBranches(): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>('/api/v1/client/options/branches');
  }

  // ── BranchDesk ──
  branchSelf(): Observable<BranchOption> {
    return this.http.get<BranchOption>('/api/v1/branch/options/self');
  }

  // ── PayDek ──
  paydekClients(): Observable<ClientOption[]> {
    return this.http.get<ClientOption[]>('/api/v1/paydek/options/clients');
  }
  paydekBranches(clientId: string): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>('/api/v1/paydek/options/branches', { params: { clientId } });
  }

  // ── Auditor ──
  auditorClients(): Observable<ClientOption[]> {
    return this.http.get<ClientOption[]>('/api/v1/auditor/options/clients');
  }
  auditorBranches(clientId: string): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>('/api/v1/auditor/options/branches', { params: { clientId } });
  }

  // ── CEO / CCO (same as admin — sees everything) ──
  ceoClients(): Observable<ClientOption[]> {
    return this.http.get<ClientOption[]>('/api/v1/admin/options/clients');
  }
  ceoBranches(clientId: string): Observable<BranchOption[]> {
    return this.http.get<BranchOption[]>('/api/v1/admin/options/branches', { params: { clientId } });
  }
}
