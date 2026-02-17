import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { forkJoin, of } from 'rxjs';

export type Role = { id: string; code: string; name: string; description: string };

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export interface PagedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface UserDirectoryGroup {
  client: { id: string; name: string } | null;
  counts: { contractors: number; clientUsers: number };
  items: UserRow[];
}

export type UserDirectoryResponse = PagedResponse<UserRow> | { groups: UserDirectoryGroup[]; page: number; limit: number; total: number };

export type UserRow = {
  id: string;
  roleId: string;
  name: string;
  email: string;
  mobile: string | null;
  isActive: boolean;
  createdAt?: string;
  // Optional role code, provided by backend for convenience
  roleCode?: string | null;
  // Advanced directory extras
  status?: 'ACTIVE' | 'INACTIVE';
  client?: { id: string; name: string } | null;
  contractorCode?: string | null;
  branches?: { id: string; name: string }[];
};

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  constructor(private http: HttpClient) {}

  roles() {
    return this.http.get<Role[]>(`${environment.apiBaseUrl}/api/admin/roles`);
  }

  // Backward compatible names (used by components)
  getRoles() {
    return this.roles();
  }

  users() {
    // legacy (returns first 1000)
    return this.http.get<UserRow[]>(`${environment.apiBaseUrl}/api/admin/users`);
  }

  getUsers() {
    return this.users();
  }

  // Active CCO users for dropdowns
  getCcoUsers() {
    const params = new HttpParams().set('role', 'CCO');
    return this.http.get<Array<{ id: string; name: string; email: string }>>(
      `${environment.apiBaseUrl}/api/admin/users`,
      { params },
    );
  }

  // Generic helper: fetch active users for a given role code
  getActiveUsersByRole(roleCode: string) {
    const params = new HttpParams().set('role', roleCode);
    return this.http.get<Array<{ id: string; name: string; email: string }>>(
      `${environment.apiBaseUrl}/api/admin/users`,
      { params },
    );
  }

  usersPaged(params: {
    q?: string;
    roleId?: string | 'all';
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    const q = (params.q || '').trim();
    const roleId = params.roleId === 'all' ? undefined : params.roleId;
    const status = params.status === 'all' ? undefined : params.status;

    const query: any = {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    };
    if (q) query.q = q;
    if (roleId) query.roleId = roleId;
    if (status) query.status = status;
    if (params.sortBy) query.sortBy = params.sortBy;
    if (params.sortDir) query.sortDir = params.sortDir;

    return this.http.get<PagedResult<UserRow>>(`${environment.apiBaseUrl}/api/admin/users`, { params: query });
  }

  // Advanced user directory: global search + filters + pagination + optional grouping
  getUserDirectory(params: {
    search?: string;
    roleCode?: string | 'all';
    clientId?: string | 'all';
    branchId?: string | 'all';
    status?: 'all' | 'ACTIVE' | 'INACTIVE';
    page?: number;
    limit?: number;
    groupByClient?: boolean;
  }) {
    let roleCode = params.roleCode === 'all' ? undefined : params.roleCode;
    let clientId = params.clientId === 'all' ? undefined : params.clientId;
    let branchId = params.branchId === 'all' ? undefined : params.branchId;
    let status = params.status === 'all' ? undefined : params.status;

    const query: any = {
      page: params.page || 1,
      limit: params.limit || 25,
    };
    if (params.search && params.search.trim()) query.search = params.search.trim();
    if (roleCode) query.roleCode = roleCode;
    if (clientId) query.clientId = clientId;
    if (branchId) query.branchId = branchId;
    if (status) query.status = status;
    if (typeof params.groupByClient === 'boolean') {
      query.groupByClient = String(params.groupByClient);
    }

    return this.http.get<UserDirectoryResponse>(`${environment.apiBaseUrl}/api/admin/users/directory`, { params: query });
  }

  createUser(payload: { roleId: string; clientId?: string; ownerCcoId?: string; name: string; email: string; mobile?: string | null; password: string }) {
    return this.http.post(`${environment.apiBaseUrl}/api/admin/users`, payload);
  }

  updateUserStatus(id: string, isActive: boolean) {
    return this.http.patch(`${environment.apiBaseUrl}/api/admin/users/${id}/status`, { isActive });
  }

  deleteUser(id: string) {
    return this.http.delete(`${environment.apiBaseUrl}/api/admin/users/${id}`);
  }

  // Client users with linked client info
  getClientUsersWithClient() {
    return this.http.get<Array<{
      clientId: string;
      clientName: string;
      clientCode: string;
      status: string;
      userId: string;
      userName: string;
      userEmail: string;
      userMobile: string | null;
    }>>(`${environment.apiBaseUrl}/api/admin/client-users-with-client`);
  }

  // Contractor links (client + branches per contractor user)
  getContractorLinks() {
    return this.http.get<Array<{
      userId: string;
      userName: string;
      userEmail: string;
      clientId: string | null;
      clientName: string | null;
      branches: { id: string; name: string }[];
    }>>(`${environment.apiBaseUrl}/api/admin/contractors/links`);
  }

  // Assignments API
  listCrmAssignments() {
    return this.http.get<any[]>(`${environment.apiBaseUrl}/api/admin/assignments/crm`);
  }

  // UUID payloads
  assignCrm(payload: { clientId: string; crmId: string }) {
    return this.http.post(`${environment.apiBaseUrl}/api/admin/assignments/crm`, payload);
  }

  listAuditorAssignments() {
    return this.http.get<any[]>(`${environment.apiBaseUrl}/api/admin/assignments/auditor`);
  }

  // UUID payloads
  assignAuditor(payload: { clientId: string; auditorId: string }) {
    return this.http.post(`${environment.apiBaseUrl}/api/admin/assignments/auditor`, payload);
  }


  // Branch-wise auditor assignments (multiple auditors per client)
  listBranchAuditorAssignments(params?: { clientId?: string; auditorUserId?: string; branchId?: string }) {
    let httpParams = new HttpParams();
    if (params?.clientId) httpParams = httpParams.set('clientId', params.clientId);
    if (params?.auditorUserId) httpParams = httpParams.set('auditorUserId', params.auditorUserId);
    if (params?.branchId) httpParams = httpParams.set('branchId', params.branchId);
    return this.http.get<any[]>(`${environment.apiBaseUrl}/api/admin/assignments/branch-auditors`, { params: httpParams });
  }

  assignAuditorToBranch(payload: { clientId: string; branchId: string; auditorId: string }) {
    return this.http.post(`${environment.apiBaseUrl}/api/admin/assignments/branch-auditors`, payload);
  }

  endBranchAuditorAssignment(id: string) {
    return this.http.delete(`${environment.apiBaseUrl}/api/admin/assignments/branch-auditors/${id}`);
  }


  // Clients (used by assignments UI)
  getClients() {
    // Admin scope (do not call CCO routes from Admin UI)
    return this.http.get<any[]>(`${environment.apiBaseUrl}/api/admin/clients`);
  }

  // Clients (master data - company list)
  getAdminClients() {
    return this.http.get<Array<{id: string, clientName: string}>>(`${environment.apiBaseUrl}/api/admin/clients`);
  }

  // Branches for a given client (admin scope), used for filters
  getBranchesForAdminClient(clientId: string) {
    return this.http.get<Array<{
      id: string;
      clientId: string;
      branchName: string;
      branchType: string;
      address: string;
      employeeCount: number;
      contractorCount: number;
      status: string;
    }>>(`${environment.apiBaseUrl}/api/admin/clients/${clientId}/branches`);
  }

  assignClient(clientId: string, payload: { crmId: string | null; auditorId: string | null }) {
    /**
     * Backward-compatible helper for older UI that previously called CCO "assign".
     * Admin assigns via dedicated endpoints.
     */
    const calls = [];
    if (payload?.crmId) {
      calls.push(this.assignCrm({ clientId, crmId: payload.crmId }));
    }
    if (payload?.auditorId) {
      calls.push(this.assignAuditor({ clientId, auditorId: payload.auditorId }));
    }
    // If neither is provided, keep behavior as a no-op observable
    if (!calls.length) return of({ ok: true });
    return forkJoin(calls);
  }

  // Deletion approvals (CCO/CEO)
  getPendingApprovals() {
    return this.http.get<Array<{
      // Backend uses UUID/string identifiers for approvals
      id: string;
      entityType: string;
      entityId: string;
      requestedByUserId: string;
      requiredApproverRole: string;
      requiredApproverUserId: string | null;
      status: string;
      requestedAt: string;
      entityLabel?: string | null;
      requestedByUserName?: string | null;
      requestedByUserEmail?: string | null;
    }>>(`${environment.apiBaseUrl}/api/approvals/pending`);
  }

  approveDeletionRequest(id: string) {
    return this.http.post(`${environment.apiBaseUrl}/api/approvals/${id}/approve`, {});
  }
}
