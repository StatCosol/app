import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ClientDto } from './cco-clients.api';

export interface BranchDto {
  id: string;
  clientId: string;
  branchName: string;
  branchType: string;
  address: string;
  employeeCount: number;
  contractorCount: number;
  status: string;
  stateCode?: string;
  establishmentType?: 'FACTORY' | 'ESTABLISHMENT' | 'WAREHOUSE' | 'SHOP' | 'HO' | 'BRANCH';
  createdAt?: string;
}

export interface CreateBranchRequest {
  branchName: string;
  branchType?: string;
  address?: string;
  employeeCount?: number;
  contractorCount?: number;
  status?: string;
  stateCode?: 'AP' | 'TG' | 'TN' | 'KA';
  establishmentType?: 'FACTORY' | 'ESTABLISHMENT' | 'WAREHOUSE' | 'SHOP' | 'HO' | 'BRANCH';
  branchUserName?: string;
  branchUserEmail?: string;
  branchUserPassword?: string;
}

export interface BranchContractorDto {
  id: string;
  branchId: string;
  clientId: string;
  userId: string;
  name?: string;
  email?: string;
  mobile?: string;
  createdAt?: string;
}

export interface ContractorBranchesDto {
  contractorId: string;
  clientId: string | null;
  branches: { id: string; branchName: string; clientId: string }[];
}

export interface BranchComplianceSummaryDto {
  id: string;
  branchId: string;
  complianceId: string;
  complianceName: string;
  lawName: string | null;
  lawFamily?: string; // <-- Add this line
  frequency: string | null;
  status: string;
  dueDate: string | null;
  // UI properties
  selected?: boolean;
  autoApplicable?: boolean;
}

export interface ComplianceWorkItemDto {
  id: string;
  clientId: string;
  branchId: string;
  complianceId: string;
  complianceName: string;
  ownerUserId: string;
  dueDate: string | null;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class CrmClientsApi {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  /** Returns only clients assigned to the current CRM user */
  getAssignedClients() {
    return this.http.get<ClientDto[]>(`${this.baseUrl}/api/v1/crm/clients/assigned`);
  }

  /** Returns branches for a given client, scoped to current CRM user */
  getBranchesForClient(clientId: string) {
    return this.http.get<BranchDto[]>(
      `${this.baseUrl}/api/v1/crm/clients/${clientId}/branches`,
    );
  }

  /** Creates a branch for the given client, scoped to current CRM user */
  createBranch(clientId: string, payload: CreateBranchRequest) {
    return this.http.post<BranchDto>(
      `${this.baseUrl}/api/v1/crm/clients/${clientId}/branches`,
      payload,
    );
  }

  /** Updates a branch (CRM-scoped by client assignment) */
  updateBranch(branchId: string, payload: Partial<CreateBranchRequest>) {
    return this.http.patch<BranchDto>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}`,
      payload,
    );
  }

  /** Deletes a branch (CRM-scoped by client assignment) */
  deleteBranch(branchId: string) {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}`,
    );
  }

  /** Lists contractors for a branch (CRM-scoped) */
  listBranchContractors(branchId: string) {
    return this.http.get<BranchContractorDto[]>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}/contractors`,
    );
  }

  /** Contractor-centric view: branches for a contractor (within assigned client scope) */
  getContractorBranches(contractorId: string) {
    return this.http.get<ContractorBranchesDto>(
      `${this.baseUrl}/api/v1/crm/contractors/${contractorId}/branches`,
    );
  }

  /** Replace branches for a contractor (within assigned client scope) */
  setContractorBranches(contractorId: string, branchIds: string[]) {
    return this.http.put<{ message: string; contractorId: string; branchIds: string[] }>(
      `${this.baseUrl}/api/v1/crm/contractors/${contractorId}/branches`,
      { branchIds },
    );
  }

  /** Links a contractor user to a branch (CRM-scoped) */
  addBranchContractor(branchId: string, userId: string) {
    return this.http.post<{ id: string; message: string }>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}/contractors`,
      { userId },
    );
  }

  /** Unlinks a contractor user from a branch (CRM-scoped) */
  removeBranchContractor(branchId: string, userId: string) {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}/contractors/${userId}`,
    );
  }

  /** Lists full compliance master list with applicability flags for a branch */
  listBranchCompliances(branchId: string) {
    return this.http.get<BranchComplianceSummaryDto[]>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}/compliances`,
    );
  }

  /** Saves the selected compliance mappings for a branch */
  saveBranchCompliances(branchId: string, complianceIds: string[]) {
    return this.http.post<{ ok: boolean; count: number }>(
      `${this.baseUrl}/api/v1/crm/branches/${branchId}/compliances`,
      { complianceIds },
    );
  }

  /** CRM compliance worklist across assigned clients */
  listComplianceWorklist(params: {
    clientId?: string | 'all';
    branchId?: string | 'all';
    status?: 'all' | 'PENDING' | 'COMPLETED' | 'OVERDUE';
    dueMonth?: string;
  }) {
    const query: any = {};
    if (params.clientId && params.clientId !== 'all') {
      query.clientId = params.clientId;
    }
    if (params.branchId && params.branchId !== 'all') {
      query.branchId = params.branchId;
    }
    if (params.status && params.status !== 'all') {
      query.status = params.status;
    }
    if (params.dueMonth) {
      query.dueMonth = params.dueMonth;
    }

    return this.http.get<{ data: ComplianceWorkItemDto[]; total: number }>(
      `${this.baseUrl}/api/v1/crm/compliance`,
      { params: query },
    );
  }
}
