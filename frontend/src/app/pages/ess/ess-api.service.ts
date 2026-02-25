import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ─── Types ────────────────────────────────────────────────────
export interface EssProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  fatherName: string | null;
  phone: string | null;
  email: string | null;
  aadhaar: string | null;
  pan: string | null;
  uan: string | null;
  esic: string | null;
  pfApplicable: boolean;
  pfRegistered: boolean;
  esiApplicable: boolean;
  esiRegistered: boolean;
  bankName: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  designation: string | null;
  department: string | null;
  dateOfJoining: string | null;
  dateOfExit: string | null;
  stateCode: string | null;
  isActive: boolean;
}

export interface CompanyBranding {
  clientId: string;
  clientCode: string | null;
  clientName: string;
  logoUrl: string | null;
  branchName: string | null;
}

export interface StatutoryDetails {
  pf: {
    uan: string | null;
    memberId: string | null;
    joinDate: string | null;
    exitDate: string | null;
    applicable: boolean;
    registered: boolean;
    wages: string | null;
  };
  esi: {
    ipNumber: string | null;
    dispensary: string | null;
    joinDate: string | null;
    exitDate: string | null;
    applicable: boolean;
    registered: boolean;
    wages: string | null;
  };
  pt: { registrationNumber: string | null };
  lwf: { applicable: boolean };
}

export interface ContributionRow {
  periodYear: number;
  periodMonth: number;
  grossEarnings: string;
  pfEmployee: string;
  pfEmployer: string;
  epsEmployer: string;
  esiEmployee: string;
  esiEmployer: string;
  pt: string;
  lwfEmployee: string;
  lwfEmployer: string;
}

export interface EssNomination {
  id: string;
  nominationType: string;
  declarationDate: string | null;
  witnessName: string | null;
  witnessAddress: string | null;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  members: EssNominationMember[];
}

export interface EssNominationMember {
  id: string;
  memberName: string;
  relationship: string | null;
  sharePct: number;
  isMinor: boolean;
  guardianName: string | null;
}

export interface LeaveBalance {
  id: string;
  leaveType: string;
  year: number;
  opening: string;
  accrued: string;
  used: string;
  lapsed: string;
  available: string;
}

export interface LeavePolicy {
  id: string;
  leaveType: string;
  leaveName: string;
  yearlyLimit: string;
  maxDaysPerRequest: string;
  requiresDocument: boolean;
}

export interface LeaveApplication {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  totalDays: string;
  reason: string | null;
  status: string;
  appliedAt: string | null;
  actionedAt: string | null;
  rejectionReason: string | null;
}

export interface Payslip {
  id: string;
  periodYear: number;
  periodMonth: number;
  fileName: string;
  fileSize: string;
  filePath: string;
  generatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class EssApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/ess`;

  constructor(private http: HttpClient) {}

  // Company Branding
  getCompanyBranding(): Observable<CompanyBranding> {
    return this.http.get<CompanyBranding>(`${this.base}/company`);
  }

  // Profile
  getProfile(): Observable<EssProfile> {
    return this.http.get<EssProfile>(`${this.base}/profile`);
  }

  // Statutory (PF/ESI details)
  getStatutory(): Observable<StatutoryDetails> {
    return this.http.get<StatutoryDetails>(`${this.base}/statutory`);
  }

  // Contributions (monthly PF/ESI history)
  getContributions(from?: string, to?: string): Observable<ContributionRow[]> {
    let params = '';
    const parts: string[] = [];
    if (from) parts.push(`from=${from}`);
    if (to) parts.push(`to=${to}`);
    if (parts.length) params = '?' + parts.join('&');
    return this.http.get<ContributionRow[]>(`${this.base}/contributions${params}`);
  }

  // Nominations
  listNominations(): Observable<EssNomination[]> {
    return this.http.get<any>(`${this.base}/nominations`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? []) as EssNomination[]),
    );
  }

  createNomination(body: any): Observable<any> {
    return this.http.post(`${this.base}/nominations`, body);
  }

  submitNomination(id: string): Observable<any> {
    return this.http.put(`${this.base}/nominations/${id}/submit`, {});
  }

  resubmitNomination(id: string, body: any): Observable<any> {
    return this.http.put(`${this.base}/nominations/${id}/resubmit`, body);
  }

  // Leave
  getLeaveBalances(year?: number): Observable<LeaveBalance[]> {
    const params = year ? `?year=${year}` : '';
    return this.http.get<LeaveBalance[]>(`${this.base}/leave/balances${params}`);
  }

  getLeavePolicies(): Observable<LeavePolicy[]> {
    return this.http.get<LeavePolicy[]>(`${this.base}/leave/policies`);
  }

  listLeaveApplications(): Observable<LeaveApplication[]> {
    return this.http.get<any>(`${this.base}/leave/applications`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? []) as LeaveApplication[]),
    );
  }

  applyLeave(body: any): Observable<any> {
    return this.http.post(`${this.base}/leave/apply`, body);
  }

  cancelLeave(id: string): Observable<any> {
    return this.http.put(`${this.base}/leave/${id}/cancel`, {});
  }

  // Payslips
  listPayslips(): Observable<Payslip[]> {
    return this.http.get<any>(`${this.base}/payslips`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? []) as Payslip[]),
    );
  }

  downloadPayslip(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/payslips/${id}/download`, {
      responseType: 'blob',
    });
  }
}
