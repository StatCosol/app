import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ServicePackageOption {
  code: string;
  label: string;
  description?: string;
  modules: string[];
  allowCustomModules?: boolean;
}

export interface ServiceModuleOption {
  code: string;
  label: string;
  description: string;
}

export interface ServiceChangeRequest {
  id: string;
  clientId: string;
  clientName: string | null;
  packageCode: string;
  requestedModules: string[];
  currentModules: string[];
  status: 'PENDING_CCO' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  requestNote: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  requestedByName: string | null;
  reviewedByName: string | null;
}

export interface ClientServiceStatus {
  clientId: string;
  packageCode: string;
  enabledModules: string[];
  isRestricted: boolean;
  pendingRequests: Array<{
    id: string;
    packageCode: string;
    requestedAt: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ServiceEntitlementsApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/service-entitlements`;

  constructor(private readonly http: HttpClient) {}

  listPackages(): Observable<ServicePackageOption[]> {
    return this.http.get<ServicePackageOption[]>(`${this.base}/packages`);
  }

  listModules(): Observable<ServiceModuleOption[]> {
    return this.http.get<ServiceModuleOption[]>(`${this.base}/modules`);
  }

  getClientStatus(clientId: string): Observable<ClientServiceStatus> {
    return this.http.get<ClientServiceStatus>(`${this.base}/clients/${clientId}`);
  }

  listRequests(status?: string): Observable<ServiceChangeRequest[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<ServiceChangeRequest[]>(`${this.base}/requests`, { params });
  }

  createRequest(payload: {
    clientId: string;
    packageCode: string;
    modules?: string[];
    note?: string;
  }): Observable<ServiceChangeRequest> {
    return this.http.post<ServiceChangeRequest>(`${this.base}/requests`, payload);
  }

  reviewRequest(
    id: string,
    payload: { action: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; note?: string },
  ): Observable<ServiceChangeRequest> {
    return this.http.patch<ServiceChangeRequest>(`${this.base}/requests/${id}/review`, payload);
  }
}
