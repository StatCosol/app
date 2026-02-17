import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// --- Type Definitions ---
export interface UserDto {
  id: string;
  userCode?: string | null;
  name: string;
  email: string;
  roleCode: string;
  isActive?: boolean;
  roleId?: string;
  client?: { id: string; name: string };
  branches?: Array<{ id: string; name: string }>;
  [key: string]: any;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  [key: string]: any;
}

export interface UserRow extends UserDto {
  status?: string;
}

export interface UserDirectoryGroup {
  client: { id: string; name: string } | null;
  counts: { contractors: number; clientUsers: number };
  items: UserRow[];
}

export interface UserDirectoryResponse {
  items?: UserRow[];
  groups?: UserDirectoryGroup[];
  total?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersApi {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  /**
   * Simple list used by a few legacy screens.
   * Backend: GET /api/admin/users/list
   */
  listUsersSimple() {
    return this.http.get<UserDto[]>(`${this.baseUrl}/api/admin/users/list`);
  }

  /**
   * Paged list + filters.
   * Backend: GET /api/admin/users
   */
  listUsers(params?: any) {
    return this.http.get<UserDirectoryResponse>(`${this.baseUrl}/api/admin/users`, { params });
  }

  /**
   * Advanced directory: GET /api/admin/users/directory
   */
  getUserDirectory(params: Record<string, string>) {
    let httpParams = new HttpParams();
    for (const key of Object.keys(params)) {
      if (params[key] != null) {
        httpParams = httpParams.set(key, params[key]);
      }
    }
    return this.http.get<UserDirectoryResponse>(`${this.baseUrl}/api/admin/users/directory`, { params: httpParams });
  }

  // Roles
  getRoles() {
    return this.http.get<Role[]>(`${this.baseUrl}/api/admin/roles`);
  }

  getRoleById(id: string) {
    return this.http.get<Role>(`${this.baseUrl}/api/admin/roles/${id}`);
  }

  // Master data
  getAdminClients() {
    return this.http.get<any[]>(`${this.baseUrl}/api/admin/clients`);
  }

  getBranchesForAdminClient(clientId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/api/admin/clients/${clientId}/branches`);
  }

  // Dropdown helpers
  getCcoUsers() {
    return this.http.get<any[]>(`${this.baseUrl}/api/admin/users/cco`);
  }

  getActiveUsersByRole(role: string) {
    return this.http.get<any[]>(`${this.baseUrl}/api/admin/users/active-by-role/${role}`);
  }

  createUser(payload: any) {
    return this.http.post<any>(`${this.baseUrl}/api/admin/users`, payload);
  }

  deleteUser(userId: string) {
    return this.http.delete<any>(`${this.baseUrl}/api/admin/users/${userId}`);
  }

  updateUserStatus(userId: string, isActive: boolean) {
    return this.http.patch<any>(`${this.baseUrl}/api/admin/users/${userId}/status`, { isActive });
  }

  /**
   * Deletion approvals (CCO/CEO only).
   * Backend: GET /api/approvals/pending
   */
  getPendingApprovals() {
    return this.http.get<any[]>(`${this.baseUrl}/api/approvals/pending`);
  }

  /**
   * Approve deletion request (CCO/CEO only).
   * Backend: POST /api/approvals/:id/approve
   */
  approveDeletionRequest(requestId: string) {
    return this.http.post<any>(`${this.baseUrl}/api/approvals/${requestId}/approve`, {});
  }
}
