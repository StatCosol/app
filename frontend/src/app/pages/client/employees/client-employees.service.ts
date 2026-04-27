import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Observable, map } from 'rxjs';

export type Employee = {
  id: string;
  clientId: string;
  branchId: string | null;
  employeeCode: string;
  name: string;
  dateOfBirth: string | null;
  gender: string | null;
  fatherName: string | null;
  phone: string | null;
  email: string | null;
  aadhaar: string | null;
  pan: string | null;
  uan: string | null;
  esic: string | null;
  bankName: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  designation: string | null;
  department: string | null;
  dateOfJoining: string | null;
  dateOfExit: string | null;
  stateCode: string | null;
  ctc: number | null;
  monthlyGross: number | null;
  isActive: boolean;
  approvalStatus: string;
};

export type EmployeeNomination = {
  id: string;
  employeeId: string;
  nominationType: string;
  declarationDate: string | null;
  witnessName: string | null;
  witnessAddress: string | null;
  status: string;
  members: NominationMember[];
};

export type NominationMember = {
  id: string;
  memberName: string;
  relationship: string | null;
  dateOfBirth: string | null;
  sharePct: number;
  address: string | null;
  isMinor: boolean;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianAddress: string | null;
};

@Injectable({ providedIn: 'root' })
export class ClientEmployeesService {
  private base = `${environment.apiBaseUrl}/api/v1/client/employees`;

  constructor(private http: HttpClient) {}

  list(q?: {
    branchId?: string;
    isActive?: string;
    approvalStatus?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Observable<{ data: Employee[]; total: number }> {
    let p = new HttpParams();
    if (q?.branchId) p = p.set('branchId', q.branchId);
    if (q?.isActive) p = p.set('isActive', q.isActive);
    if (q?.approvalStatus) p = p.set('approvalStatus', q.approvalStatus);
    if (q?.search) p = p.set('search', q.search);
    if (q?.limit) p = p.set('limit', String(q.limit));
    if (q?.offset) p = p.set('offset', String(q.offset));

    return this.http.get<any>(this.base, { params: p }).pipe(
      map((res) => ({
        data: (res?.data ?? res ?? []).map((r: any) => this.mapEmployee(r)),
        total: res?.total ?? (res?.data ?? res ?? []).length,
      })),
    );
  }

  getById(id: string): Observable<Employee> {
    return this.http.get<any>(`${this.base}/${id}`).pipe(map((r) => this.mapEmployee(r)));
  }

  create(body: Partial<Employee> & { stateCode?: string; branchCode?: string }): Observable<Employee> {
    return this.http.post<any>(this.base, body).pipe(map((r) => this.mapEmployee(r)));
  }

  update(id: string, body: Partial<Employee>): Observable<Employee> {
    return this.http.put<any>(`${this.base}/${id}`, body).pipe(map((r) => this.mapEmployee(r)));
  }

  deactivate(id: string, body?: { exitReason?: string; dateOfExit?: string }): Observable<Employee> {
    return this.http.put<any>(`${this.base}/${id}/deactivate`, body || {}).pipe(map((r) => this.mapEmployee(r)));
  }

  listNominations(employeeId: string): Observable<EmployeeNomination[]> {
    return this.http.get<any>(`${this.base}/${employeeId}/nominations`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? []) as EmployeeNomination[]),
    );
  }

  createNomination(employeeId: string, body: any): Observable<any> {
    return this.http.post(`${this.base}/${employeeId}/nominations`, body);
  }

  generateForm(employeeId: string, formType: string): Observable<any> {
    return this.http.post(`${this.base}/${employeeId}/forms/generate?type=${formType}`, {});
  }

  /** Print/download a nomination form PDF (PF / ESI / GRATUITY / INSURANCE / SALARY) */
  printNominationForm(employeeId: string, formType: string): Observable<Blob> {
    return this.http.get(
      `${this.base}/${employeeId}/nominations/print?type=${encodeURIComponent(formType)}`,
      { responseType: 'blob' },
    );
  }

  listForms(employeeId: string): Observable<any[]> {
    return this.http.get<any>(`${this.base}/${employeeId}/forms`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? [])),
    );
  }

  /** Download appointment letter PDF or Word */
  downloadAppointmentLetter(employeeId: string, format: 'pdf' | 'docx' = 'pdf'): Observable<Blob> {
    const params = format === 'docx' ? '?format=docx' : '';
    return this.http.get(`${this.base}/${employeeId}/appointment-letter${params}`, {
      responseType: 'blob',
    });
  }

  /** Download all appointment letters as a ZIP */
  downloadAppointmentLettersBulk(format: 'pdf' | 'docx' = 'pdf'): Observable<Blob> {
    const params = format === 'docx' ? '?format=docx' : '';
    return this.http.get(`${this.base}/appointment-letters-bulk${params}`, {
      responseType: 'blob',
    });
  }

  /** Create ESS login for an employee */
  provisionEss(employeeId: string, password?: string): Observable<any> {
    const body: any = {};
    if (password) body.password = password;
    return this.http.post(`${this.base}/${employeeId}/provision-ess`, body);
  }

  /** Approve a pending employee registration */
  approve(id: string): Observable<Employee> {
    return this.http.put<any>(`${this.base}/${id}/approve`, {}).pipe(map((r) => this.mapEmployee(r)));
  }

  /** Reject a pending employee registration */
  reject(id: string): Observable<Employee> {
    return this.http.put<any>(`${this.base}/${id}/reject`, {}).pipe(map((r) => this.mapEmployee(r)));
  }

  private mapEmployee(r: any): Employee {
    return {
      id: r?.id ?? '',
      clientId: r?.clientId ?? r?.client_id ?? '',
      branchId: r?.branchId ?? r?.branch_id ?? null,
      employeeCode: r?.employeeCode ?? r?.employee_code ?? '',
      name: r?.name ?? ([r?.firstName ?? r?.first_name, r?.lastName ?? r?.last_name].filter(Boolean).join(' ').trim() || ''),
      dateOfBirth: r?.dateOfBirth ?? r?.date_of_birth ?? null,
      gender: r?.gender ?? null,
      fatherName: r?.fatherName ?? r?.father_name ?? null,
      phone: r?.phone ?? null,
      email: r?.email ?? null,
      aadhaar: r?.aadhaar ?? null,
      pan: r?.pan ?? null,
      uan: r?.uan ?? null,
      esic: r?.esic ?? null,
      bankName: r?.bankName ?? r?.bank_name ?? null,
      bankAccount: r?.bankAccount ?? r?.bank_account ?? null,
      ifsc: r?.ifsc ?? null,
      designation: r?.designation ?? null,
      department: r?.department ?? null,
      dateOfJoining: r?.dateOfJoining ?? r?.date_of_joining ?? null,
      dateOfExit: r?.dateOfExit ?? r?.date_of_exit ?? null,
      stateCode: r?.stateCode ?? r?.state_code ?? null,
      ctc: r?.ctc != null ? Number(r.ctc) : null,
      monthlyGross: r?.monthlyGross != null ? Number(r.monthlyGross) : (r?.monthly_gross != null ? Number(r.monthly_gross) : null),
      isActive: r?.isActive ?? r?.is_active ?? true,
      approvalStatus: (r?.approvalStatus ?? r?.approval_status ?? 'APPROVED').toUpperCase(),
    };
  }
}
