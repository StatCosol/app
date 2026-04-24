import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';

export interface Client {
  id: string;
  clientName: string;
  clientCode?: string;
  status?: string;
  branchesCount?: number;
  totalEmployees?: number;
  registeredAddress?: string;
  state?: string;
  industry?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactMobile?: string;
  companyCode?: string;
  logoUrl?: string;
  crmOnBehalfEnabled?: boolean;
}

export interface Branch {
  id?: string;
  clientId?: string;
  branchName: string;
  branchType: 'HO' | 'ZONAL' | 'SALES' | 'ESTABLISHMENT' | 'FACTORY';
  address: string;
  employeeCount?: number;
  contractorCount?: number;
  status?: string;
  establishmentType?: string;
  city?: string;
  pincode?: string;
  
  // Two-letter state code used for compliance applicability (e.g., TS, AP)
  stateCode?: string | null;

  // Total headcount (can be derived from employeeCount + contractorCount)
  headcount?: number;

  // Branch desk user fields (required for new branches)
  branchUserName: string;
  branchUserEmail: string;
  branchUserMobile: string;
  branchUserPassword?: string;
}

export interface Compliance {
  id: string;
  complianceName: string;
  lawName: string;
  frequency: string;
  description?: string;
  isActive: boolean;
}

export interface BranchComplianceApplicability {
  complianceId: string;
  complianceName: string;
  lawName: string;
  frequency: string;
  applicable: boolean;
  reason: string;
  selected: boolean;
  autoApplicable?: boolean;
}

export interface ClientUserLink {
  id: string;
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  createdAt: string;
}

export interface ClientUserOption {
  id: string;
  name: string;
  email: string;
}

export interface BranchContractorLink {
  id: string;
  branchId: string;
  clientId: string;
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  createdAt: string;
}

export interface ContractorOption {
  id: string;
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AdminClientsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl}/api/v1/admin`;

  // Client APIs
  getClients(): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiUrl}/clients/with-aggregates`);
  }

  getClient(id: string): Observable<Client> {
    return this.http.get<Client>(`${this.apiUrl}/clients/${id}`);
  }

  createClient(payload: {
    clientName: string;
    masterUserName?: string;
    masterUserEmail?: string;
    masterUserMobile?: string;
    masterUserPassword?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients`, payload);
  }

  updateClient(id: string, payload: Partial<Client>): Observable<any> {
    return this.http.put(`${this.apiUrl}/clients/${id}`, payload);
  }

  deleteClient(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clients/${id}`);
  }

  restoreClient(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients/${id}/restore`, {});
  }

  toggleCrmOnBehalf(id: string, enabled: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/clients/${id}/crm-on-behalf`, { enabled });
  }

  getReadinessCheck(clientId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/clients/${clientId}/readiness`);
  }

  // Branch contractor APIs
  getBranchContractors(branchId: string): Observable<BranchContractorLink[]> {
    return this.http.get<BranchContractorLink[]>(`${this.apiUrl}/branches/${branchId}/contractors`);
  }

  addBranchContractor(branchId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/branches/${branchId}/contractors`, { userId });
  }

  removeBranchContractor(branchId: string, userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/branches/${branchId}/contractors/${userId}`);
  }

  // Client user linking APIs
  getClientUsers(clientId: string): Observable<ClientUserLink[]> {
    return this.http.get<ClientUserLink[]>(`${this.apiUrl}/clients/${clientId}/users`);
  }

  addClientUser(clientId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients/${clientId}/users`, { userId });
  }

  removeClientUser(clientId: string, userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clients/${clientId}/users/${userId}`);
  }

  // All active CLIENT-role users (for dropdown options)
  getClientRoleUsers(): Observable<ClientUserOption[]> {
    return this.http.get<ClientUserOption[]>(`${this.apiUrl}/users`, {
      params: { role: 'CLIENT' },
    });
  }

  // Update a user's details (name, email, mobile)
  updateUser(userId: string, payload: { name?: string; email?: string; mobile?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/${userId}`, payload);
  }

  // Admin-triggered password reset — returns { newPassword }
  resetUserPassword(userId: string): Observable<{ newPassword: string }> {
    return this.http.post<{ newPassword: string }>(`${this.apiUrl}/users/${userId}/reset-password`, {});
  }

  // All active CONTRACTOR-role users for a specific client (dropdown options)
  getContractorUsers(clientId: string): Observable<ContractorOption[]> {
    return this.http.get<ContractorOption[]>(`${this.apiUrl}/users`, {
      params: { role: 'CONTRACTOR', clientId: String(clientId) },
    });
  }

  // Branch APIs
  getBranches(clientId: string): Observable<Branch[]> {
    return this.http.get<Branch[]>(`${this.apiUrl}/clients/${clientId}/branches`);
  }

  createBranch(clientId: string, payload: Branch): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients/${clientId}/branches`, payload);
  }

  updateBranch(branchId: string, payload: Partial<Branch>): Observable<any> {
    return this.http.put(`${this.apiUrl}/branches/${branchId}`, payload);
  }

  deleteBranch(branchId: string): Observable<any> {
    // Admin delete should force execution (skip approval) so backend runs performDelete and deactivates branch users
    return this.http.delete(`${this.apiUrl}/branches/${branchId}`, {
      params: { mode: 'force' },
    });
  }

  // Compliance APIs
  getCompliances(): Observable<Compliance[]> {
    return this.http.get<Compliance[]>(`${this.apiUrl}/compliances`);
  }

  getBranchCompliances(branchId: string): Observable<BranchComplianceApplicability[]> {
    return this.http.get<BranchComplianceApplicability[]>(`${this.apiUrl}/branches/${branchId}/compliances`);
  }

  saveBranchCompliances(branchId: string, clientId: string, complianceIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/branches/${branchId}/compliances`, {
      clientId,
      complianceIds,
    });
  }

  recomputeBranchCompliances(branchId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/branches/${branchId}/compliances/recompute`, {});
  }

  // ── Logo upload ──────────────────────────────────────────
  uploadLogo(clientId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.apiUrl}/clients/${clientId}/logo`, fd);
  }

  uploadSvgCode(clientId: string, svgCode: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients/${clientId}/logo-svg`, { svgCode });
  }
}
