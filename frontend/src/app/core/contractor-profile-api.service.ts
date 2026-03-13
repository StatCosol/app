import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ContractorMeProfile {
  id: string;
  roleCode?: string | null;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  clientId?: string | null;
  clientName?: string | null;
}

export interface ContractorBranchItem {
  id: string;
  name?: string;
  branchName?: string;
  compliances?: any[];
}

@Injectable({ providedIn: 'root' })
export class ContractorProfileApiService {
  constructor(private http: HttpClient) {}

  getContractorProfile(): Observable<ContractorMeProfile> {
    return this.http.get<ContractorMeProfile>('/api/v1/me');
  }

  updateContractorProfile(payload: {
    name?: string;
    mobile?: string | null;
  }): Observable<any> {
    return this.http.patch('/api/v1/me/profile', payload);
  }

  getContractorBranches(): Observable<{
    clientId?: string;
    branches?: ContractorBranchItem[];
    monthSummary?: any;
  }> {
    return this.http.get<{
      clientId?: string;
      branches?: ContractorBranchItem[];
      monthSummary?: any;
    }>('/api/v1/contractor/dashboard');
  }

  getContractorDocuments(query: Record<string, any> = {}): Observable<any> {
    return this.http.get('/api/v1/contractor/documents', { params: query });
  }
}

