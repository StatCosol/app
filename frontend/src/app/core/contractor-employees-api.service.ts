import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SkillCategory =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

export type EmployeeStatus = 'ACTIVE' | 'LEFT' | 'INACTIVE';

export interface ContractorEmployee {
  id: string;
  clientId: string;
  branchId: string;
  contractorUserId: string;
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

  reactivate(id: string): Observable<ContractorEmployee> {
    return this.http.put<ContractorEmployee>(
      `/api/v1/contractor/employees/${id}/reactivate`,
      {},
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
