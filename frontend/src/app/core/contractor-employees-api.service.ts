import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SkillCategory =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

export type EmployeeStatus = 'ACTIVE' | 'LEFT' | 'INACTIVE' | 'PENDING_DELETE';

export interface ContractorEmployee {
  id: string;
  clientId: string;
  branchId: string;
  contractorUserId: string;
  /** User ID the biometric machine allocated at enrolment; what a punch carries. */
  punchCode: string | null;
  name: string;
  gender: string | null;
  dateOfBirth: string | null;
  fatherName: string | null;
  phone: string | null;
  email: string | null;
  aadhaar: string | null;
  pan: string | null;
  uan: string | null;
  esic: string | null;
  pfApplicable: boolean;
  esiApplicable: boolean;
  designation: string | null;
  department: string | null;
  dateOfJoining: string | null;
  dateOfExit: string | null;
  exitReason: string | null;
  isActive: boolean;
  status: EmployeeStatus;
  skillCategory: SkillCategory | null;
  monthlySalary: number | null;
  dailyWage: number | null;
  stateCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeDto {
  name: string;
  /** User ID from the biometric machine; attributes punches to this worker. */
  punchCode?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  fatherName?: string | null;
  phone?: string | null;
  email?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  uan?: string | null;
  esic?: string | null;
  pfApplicable?: boolean;
  esiApplicable?: boolean;
  designation?: string | null;
  department?: string | null;
  dateOfJoining?: string | null;
  branchId?: string;
  skillCategory?: SkillCategory | null;
  monthlySalary?: number | null;
  dailyWage?: number | null;
  stateCode?: string | null;
}

export interface BulkRowResult {
  index: number;
  ok: boolean;
  id?: string;
  name?: string;
  error?: string;
}

export interface BulkUploadResponse {
  created: number;
  failed: number;
  results: BulkRowResult[];
}

export interface ContractorEmployeeDeleteRequest {
  id: string;
  contractorEmployeeId: string;
  contractorEmployeeName: string;
  contractorUserId: string;
  contractorName: string | null;
  branchId: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ContractorEmployeesApiService {
  constructor(private http: HttpClient) {}

  list(params: {
    branchId?: string;
    isActive?: boolean;
    search?: string;
  } = {}): Observable<{ data: ContractorEmployee[]; total: number }> {
    const query: Record<string, string> = {};
    if (params.branchId) query['branchId'] = params.branchId;
    if (params.isActive !== undefined) query['isActive'] = String(params.isActive);
    if (params.search) query['search'] = params.search;
    return this.http.get<{ data: ContractorEmployee[]; total: number }>(
      '/api/v1/contractor/employees',
      { params: query },
    );
  }

  /**
   * Branch/Client-portal listing of contractor employees for a given branch.
   * Backed by `/api/v1/client/contractor-employees` which accepts CLIENT/ADMIN/CRM
   * roles (the contractor-portal `list()` above is CONTRACTOR-only and 403s for
   * branch users).
   */
  listForBranch(params: {
    branchId?: string;
    contractorUserId?: string;
    isActive?: boolean;
    search?: string;
  } = {}): Observable<{ data: ContractorEmployee[]; total: number }> {
    const query: Record<string, string> = {};
    if (params.branchId) query['branchId'] = params.branchId;
    if (params.contractorUserId) query['contractorUserId'] = params.contractorUserId;
    if (params.isActive !== undefined) query['isActive'] = String(params.isActive);
    if (params.search) query['search'] = params.search;
    return this.http.get<{ data: ContractorEmployee[]; total: number }>(
      '/api/v1/client/contractor-employees',
      { params: query },
    );
  }

  create(dto: CreateEmployeeDto): Observable<ContractorEmployee> {
    return this.http.post<ContractorEmployee>('/api/v1/contractor/employees', dto);
  }

  update(id: string, dto: Partial<CreateEmployeeDto>): Observable<ContractorEmployee> {
    return this.http.put<ContractorEmployee>(`/api/v1/contractor/employees/${id}`, dto);
  }

  deactivate(id: string, exitReason?: string): Observable<ContractorEmployee> {
    return this.http.put<ContractorEmployee>(
      `/api/v1/contractor/employees/${id}/deactivate`,
      { exitReason: exitReason || null },
    );
  }

  requestDelete(id: string, reason?: string): Observable<{
    message: string;
    requestId: string;
    status: string;
  }> {
    return this.http.post<{
      message: string;
      requestId: string;
      status: string;
    }>(`/api/v1/contractor/employees/${id}/delete-request`, {
      reason: reason || null,
    });
  }

  reactivate(id: string): Observable<ContractorEmployee> {
    return this.http.put<ContractorEmployee>(
      `/api/v1/contractor/employees/${id}/reactivate`,
      {},
    );
  }

  listDeleteRequests(): Observable<ContractorEmployeeDeleteRequest[]> {
    return this.http.get<ContractorEmployeeDeleteRequest[]>(
      '/api/v1/client/contractor-employees/delete-requests',
    );
  }

  reviewDeleteRequest(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    notes?: string,
  ): Observable<{ ok: true; status: string }> {
    return this.http.post<{ ok: true; status: string }>(
      `/api/v1/client/contractor-employees/delete-requests/${id}/review`,
      { decision, notes: notes || null },
    );
  }

  bulkUpload(
    rows: CreateEmployeeDto[],
    branchId?: string,
  ): Observable<BulkUploadResponse> {
    return this.http.post<BulkUploadResponse>(
      '/api/v1/contractor/employees/bulk',
      { branchId, rows },
    );
  }
}
