import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ─── Types ────────────────────────────────────────────────────
export interface EssProfile {
  id: string;
  employeeCode: string;
  name: string;
  dateOfBirth: string | null;
  gender: string | null;
  fatherName: string | null;
  maritalStatus: string | null;
  phone: string | null;
  email: string | null;
  aadhaar: string | null;
  pan: string | null;
  uan: string | null;
  esic: string | null;
  pfApplicable: boolean;
  pfRegistered: boolean;
  pfServiceStartDate: string | null;
  basicAtPfStart: number | null;
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
  dateOfBirth: string | null;
  address: string | null;
  sharePct: number;
  isMinor: boolean;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianAddress: string | null;
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

export interface EssAttendanceRecord {
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEK_OFF' | string;
  checkIn: string | null;
  checkOut: string | null;
  workedHours: string | null;
  overtimeHours: string | null;
  shortWorkReason: string | null;
  remarks: string | null;
  source: string | null;
  captureMethod: string | null;
  selfMarked: boolean;
}

export interface TodayAttendance {
  date: string;
  status: string | null;
  checkIn: string | null;
  checkOut: string | null;
  captureMethod?: string;
  selfMarked?: boolean;
}

export interface CheckInOutPayload {
  captureMethod?: 'MANUAL' | 'BIOMETRIC' | 'FACE' | 'GEOLOCATION';
  latitude?: number;
  longitude?: number;
  deviceInfo?: string;
}

export interface CheckOutResponse {
  success: boolean;
  date: string;
  checkOut: string;
  workedHours: string;
  overtimeHours: string;
  overtimeType: 'OT' | 'COFF' | null;
  isShortDay: boolean;
  shortWorkReasonRequired: boolean;
  coffAccrued: number;
  captureMethod: string;
}

export interface OvertimeSummary {
  month: string;
  monthlyGross: number;
  otEligibility: 'OT_PAY' | 'COMP_OFF';
  totalOtHours: number;
  paidOtHours: number;
  coffOtHours: number;
  shortDays: number;
  shortDaysPending: number;
  overtimeDays: number;
  workedOnOffDays: number;
}

export interface CompOffBalance {
  accrued: number;
  used: number;
  lapsed: number;
  available: number;
}

export interface CompOffEntry {
  id: string;
  entryDate: string;
  entryType: string;
  days: number;
  reason: string;
  remarks: string | null;
  createdAt: string;
}

export interface EssAttendanceResponse {
  month: string;
  daysInMonth: number;
  records: EssAttendanceRecord[];
}

export interface EssAttendanceSummary {
  month: string;
  daysInMonth: number;
  recordedDays: number;
  workedDays: number;
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  holidays: number;
  weekOff: number;
}

export interface EssHoliday {
  date: string;
  status: string;
  label: string;
}

export interface EssDocument {
  id: string;
  docType: string;
  docName: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  expiryDate: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  category: 'IDENTITY' | 'STATUTORY' | 'EMPLOYMENT' | 'BANK' | 'OTHER' | string;
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

  updateProfile(data: Partial<EssProfile>): Observable<EssProfile> {
    return this.http.patch<EssProfile>(`${this.base}/profile`, data);
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

  updateNomination(id: string, body: any): Observable<any> {
    return this.http.put(`${this.base}/nominations/${id}`, body);
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

  // Attendance + Holiday
  getAttendance(month?: string): Observable<EssAttendanceResponse> {
    const params = month ? `?month=${encodeURIComponent(month)}` : '';
    return this.http.get<EssAttendanceResponse>(`${this.base}/attendance${params}`);
  }

  getAttendanceSummary(month?: string): Observable<EssAttendanceSummary> {
    const params = month ? `?month=${encodeURIComponent(month)}` : '';
    return this.http.get<EssAttendanceSummary>(`${this.base}/attendance/summary${params}`);
  }

  getHolidays(month?: string): Observable<{ month: string; items: EssHoliday[] }> {
    const params = month ? `?month=${encodeURIComponent(month)}` : '';
    return this.http.get<{ month: string; items: EssHoliday[] }>(`${this.base}/holidays${params}`);
  }

    getTodayAttendance(): Observable<TodayAttendance> {
      return this.http.get<TodayAttendance>(`${this.base}/attendance/today`);
    }

    checkIn(payload: CheckInOutPayload): Observable<any> {
      return this.http.post(`${this.base}/attendance/check-in`, payload);
    }

    checkOut(payload: CheckInOutPayload): Observable<CheckOutResponse> {
      return this.http.post<CheckOutResponse>(`${this.base}/attendance/check-out`, payload);
    }

    submitShortWorkReason(body: { date?: string; reason: string }): Observable<any> {
      return this.http.post(`${this.base}/attendance/short-reason`, body);
    }

    getOvertimeSummary(month?: string): Observable<OvertimeSummary> {
      const params = month ? `?month=${encodeURIComponent(month)}` : '';
      return this.http.get<OvertimeSummary>(`${this.base}/attendance/overtime-summary${params}`);
    }

    getCompOffBalance(): Observable<CompOffBalance> {
      return this.http.get<CompOffBalance>(`${this.base}/attendance/comp-off/balance`);
    }

    getCompOffLedger(): Observable<CompOffEntry[]> {
      return this.http.get<CompOffEntry[]>(`${this.base}/attendance/comp-off/ledger`);
    }

  // Documents
  getDocuments(filters?: { category?: string; year?: number; q?: string }): Observable<{ total: number; items: EssDocument[] }> {
    const parts: string[] = [];
    if (filters?.category) parts.push(`category=${encodeURIComponent(filters.category)}`);
    if (filters?.year) parts.push(`year=${filters.year}`);
    if (filters?.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
    const params = parts.length ? '?' + parts.join('&') : '';
    return this.http.get<{ total: number; items: EssDocument[] }>(`${this.base}/documents${params}`);
  }

  getDocumentById(id: string): Observable<EssDocument> {
    return this.http.get<EssDocument>(`${this.base}/documents/${id}`);
  }

  downloadDocument(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents/${id}/download`, {
      responseType: 'blob',
    });
  }

  uploadDocument(formData: FormData): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/documents/upload`, formData);
  }

  // ── Helpdesk ────────────────────────────────────────────
  helpdeskListTickets(status?: string): Observable<any[]> {
    const params = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.http.get<any>(`${this.base}/helpdesk/tickets${params}`).pipe(
      map((res) => (Array.isArray(res) ? res : res?.data ?? [])),
    );
  }

  helpdeskCreateTicket(body: {
    category: string;
    subCategory?: string | null;
    priority?: string;
    description: string;
  }): Observable<any> {
    return this.http.post(`${this.base}/helpdesk/tickets`, body);
  }

  helpdeskGetTicket(id: string): Observable<any> {
    return this.http.get(`${this.base}/helpdesk/tickets/${id}`);
  }

  helpdeskGetMessages(ticketId: string): Observable<any[]> {
    return this.http
      .get<any>(`${environment.apiBaseUrl}/api/v1/helpdesk/tickets/${ticketId}/messages`)
      .pipe(map((res) => (Array.isArray(res) ? res : res?.data ?? [])));
  }

  helpdeskPostMessage(ticketId: string, message: string): Observable<any> {
    return this.http.post(
      `${environment.apiBaseUrl}/api/v1/helpdesk/tickets/${ticketId}/messages`,
      { message },
    );
  }

  // ── Performance Appraisal ──────────────────────────────
  getMyAppraisals(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/appraisals`);
  }

  getMyAppraisal(id: string): Observable<any> {
    return this.http.get<any>(`${this.base}/appraisals/${id}`);
  }

  submitSelfReview(id: string, items: { itemId: string; rating: number; remarks?: string }[]): Observable<any> {
    return this.http.post<any>(`${this.base}/appraisals/${id}/self-review`, { items });
  }
}
