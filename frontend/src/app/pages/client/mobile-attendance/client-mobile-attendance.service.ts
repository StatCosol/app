import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type MobileDeviceMode = 'KIOSK' | 'ESS';

export interface MobileAttendanceDevice {
  id: string;
  clientId: string;
  branchId: string | null;
  mode: MobileDeviceMode;
  deviceLabel: string | null;
  deviceName: string | null;
  installToken: string;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  registeredAt: string;
  registeredBy: string | null;
  lastSeenAt: string | null;
  lastPunchAt: string | null;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  essEmployeeId: string | null;
}

export interface RegisterMobileDeviceBody {
  mode: MobileDeviceMode;
  branchId?: string;
  deviceLabel?: string;
  geofenceLat?: number;
  geofenceLng?: number;
  geofenceRadiusM?: number;
  /** Required when mode === 'ESS'. */
  essEmployeeId?: string;
}

export interface FaceEnrollment {
  employeeId: string;
  clientId: string;
  branchId: string | null;
  azurePersonId: string | null;
  azurePersonGroup: string | null;
  embeddingModel: string | null;
  photoUrl: string | null;
  consentGivenAt: string | null;
  consentGivenBy: string | null;
  enrolledAt: string;
  enrolledBy: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  updatedAt: string;
}

export interface EnrollFaceBody {
  employeeId: string;
  consentGiven: true;
  embeddingBase64?: string;
  embeddingModel?: string;
  photoBase64?: string;
  photoMime?: string;
}

export interface EnrollmentStatusRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string | null;
  isEnrolled: boolean;
  isActive: boolean;
  embeddingModel: string | null;
  enrolledAt: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
}

export type ReenrollRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ReenrollRequestSource = 'ADMIN' | 'ESS' | 'KIOSK';

export interface ReenrollRequest {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string | null;
  branchId: string | null;
  requestedBy: string | null;
  requestedAt: string;
  reason: string | null;
  photoUrl: string | null;
  source: ReenrollRequestSource;
  status: ReenrollRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface ReviewReenrollBody {
  decision: 'APPROVED' | 'REJECTED';
  notes?: string;
}

// ── Phase 4a: contractor face-attendance bridge ────────────────────────────

export interface ContractorFaceEnrollment {
  contractorEmployeeId: string;
  clientId: string;
  branchId: string | null;
  contractorUserId: string | null;
  embeddingModel: string | null;
  photoUrl: string | null;
  consentGivenAt: string | null;
  consentGivenBy: string | null;
  enrolledAt: string;
  enrolledBy: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  updatedAt: string;
}

export interface EnrollContractorFaceBody {
  contractorEmployeeId: string;
  consentGiven: true;
  embeddingBase64?: string;
  embeddingModel?: string;
  photoBase64?: string;
  photoMime?: string;
}

export interface ContractorEnrollmentStatusRow {
  contractorEmployeeId: string;
  name: string;
  branchId: string | null;
  contractorUserId: string;
  isEnrolled: boolean;
  isActive: boolean;
  embeddingModel: string | null;
  enrolledAt: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
}

// ── Phase 4c: contractor re-enrollment approval workflow ────────────────────

export interface ContractorReenrollRequest {
  id: string;
  contractorEmployeeId: string;
  contractorName: string | null;
  branchId: string | null;
  requestedBy: string | null;
  requestedAt: string;
  reason: string | null;
  photoUrl: string | null;
  source: ReenrollRequestSource;
  status: ReenrollRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClientMobileAttendanceService {
  private base = `${environment.apiBaseUrl}/api/v1/mobile-attendance`;

  constructor(private http: HttpClient) {}

  // Devices
  listDevices(): Observable<MobileAttendanceDevice[]> {
    return this.http.get<MobileAttendanceDevice[]>(`${this.base}/devices`);
  }

  registerDevice(body: RegisterMobileDeviceBody): Observable<MobileAttendanceDevice> {
    return this.http.post<MobileAttendanceDevice>(`${this.base}/devices`, body);
  }

  renameDevice(id: string, deviceLabel: string): Observable<{ ok: true; deviceLabel: string }> {
    return this.http.patch<{ ok: true; deviceLabel: string }>(`${this.base}/devices/${id}/label`, { deviceLabel });
  }

  revokeDevice(id: string): Observable<MobileAttendanceDevice> {
    return this.http.delete<MobileAttendanceDevice>(`${this.base}/devices/${id}`);
  }

  hardDeleteDevice(id: string): Observable<{ ok: true; id: string }> {
    return this.http.delete<{ ok: true; id: string }>(`${this.base}/devices/${id}/permanent`);
  }

  configureGeofence(
    id: string,
    params: { lat: number; lng: number; radiusM: number } | null,
  ): Observable<MobileAttendanceDevice> {
    return this.http.put<MobileAttendanceDevice>(`${this.base}/devices/${id}/geofence`, params);
  }

  // Enrollment
  enrollFace(body: EnrollFaceBody): Observable<FaceEnrollment> {
    return this.http.post<FaceEnrollment>(`${this.base}/enrollment/self`, body);
  }

  listEnrollments(): Observable<EnrollmentStatusRow[]> {
    return this.http.get<EnrollmentStatusRow[]>(`${this.base}/enrollment/employees`);
  }

  deactivateEnrollment(employeeId: string, reason?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/enrollment/deactivate`, {
      subjectType: 'EMPLOYEE',
      subjectId: employeeId,
      reason,
    });
  }

  deleteEnrollment(
    employeeId: string,
    reason?: string,
  ): Observable<{ ok: true; deleted: true; employeeId: string }> {
    return this.http.post<{ ok: true; deleted: true; employeeId: string }>(
      `${this.base}/enrollment/deactivate`,
      { subjectType: 'EMPLOYEE', subjectId: employeeId, reason, permanent: true },
    );
  }

  // Re-enrollment approval queue
  // TODO: backend endpoint not yet implemented — wire up GET /mobile-attendance/enrollment/reenroll-requests?status=... when available
  listReenrollRequests(_status: ReenrollRequestStatus = 'PENDING'): Observable<ReenrollRequest[]> {
    return of([]);
  }

  reviewReenrollRequest(
    _id: string,
    _body: ReviewReenrollBody,
  ): Observable<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    return throwError(() => new Error('Not implemented'));
  }

  // ── Contractor face enrollment (Phase 4a) ──
  enrollContractorFace(body: EnrollContractorFaceBody): Observable<ContractorFaceEnrollment> {
    return this.http.post<ContractorFaceEnrollment>(`${this.base}/enrollment/self`, {
      ...body,
      subjectType: 'CONTRACTOR',
    });
  }

  listContractorEnrollments(): Observable<ContractorEnrollmentStatusRow[]> {
    return this.http.get<ContractorEnrollmentStatusRow[]>(`${this.base}/enrollment/contractors`);
  }

  deactivateContractorEnrollment(
    contractorEmployeeId: string,
    reason?: string,
  ): Observable<ContractorFaceEnrollment> {
    return this.http.post<ContractorFaceEnrollment>(`${this.base}/enrollment/deactivate`, {
      subjectType: 'CONTRACTOR',
      subjectId: contractorEmployeeId,
      reason,
    });
  }

  deleteContractorEnrollment(
    contractorEmployeeId: string,
    reason?: string,
  ): Observable<{ ok: true; deleted: true; contractorEmployeeId: string }> {
    return this.http.post<{ ok: true; deleted: true; contractorEmployeeId: string }>(
      `${this.base}/enrollment/deactivate`,
      { subjectType: 'CONTRACTOR', subjectId: contractorEmployeeId, reason, permanent: true },
    );
  }

  // ── Contractor re-enrollment approval queue (Phase 4c) ──
  // TODO: backend endpoint not yet implemented — wire up GET /mobile-attendance/enrollment/contractor-reenroll-requests?status=... when available
  listContractorReenrollRequests(
    _status: ReenrollRequestStatus = 'PENDING',
  ): Observable<ContractorReenrollRequest[]> {
    return of([]);
  }

  reviewContractorReenrollRequest(
    _id: string,
    _body: ReviewReenrollBody,
  ): Observable<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    return throwError(() => new Error('Not implemented'));
  }

  // ── Branch-portal contractor list — stubbed (no equivalent in new backend) ──
  listContractorsForBranch(_branchId?: string): Observable<ContractorForBranchRow[]> {
    return of([]);
  }

  listContractorPunches(
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      contractorEmployeeId?: string;
      contractorUserId?: string;
      limit?: number;
    } = {},
  ): Observable<ContractorPunchRow[]> {
    const parts: string[] = [];
    if (opts.from) parts.push(`from=${encodeURIComponent(opts.from)}`);
    if (opts.to) parts.push(`to=${encodeURIComponent(opts.to)}`);
    if (opts.branchId) parts.push(`branchId=${encodeURIComponent(opts.branchId)}`);
    if (opts.contractorEmployeeId)
      parts.push(`contractorEmployeeId=${encodeURIComponent(opts.contractorEmployeeId)}`);
    if (opts.limit) parts.push(`limit=${opts.limit}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http.get<ContractorPunchRow[]>(`${this.base}/punches/contractor${qs}`);
  }

  // ── Admin face-failure audit (Phase 4d step 7) ──
  updateContractorPunch(
    id: string,
    body: { punchTime?: string; direction?: 'IN' | 'OUT' | 'AUTO' },
  ): Observable<{ ok: true; id: string; punchTime: string; direction: string }> {
    return this.http.put<{
      ok: true;
      id: string;
      punchTime: string;
      direction: string;
    }>(`${this.base}/punches/contractor/${id}`, body);
  }

  createContractorPunch(body: {
    contractorEmployeeId: string;
    punchTime: string;
    direction: 'IN' | 'OUT' | 'AUTO';
  }): Observable<{ ok: true; id: string; punchTime: string; direction: string }> {
    return this.http.post<{
      ok: true;
      id: string;
      punchTime: string;
      direction: string;
    }>(`${this.base}/punches/contractor`, body);
  }

  deleteContractorPunch(id: string): Observable<{ ok: true; deleted: number }> {
    return this.http.delete<{ ok: true; deleted: number }>(
      `${this.base}/punches/contractor/${id}`,
    );
  }

  // ── Failed scans — stubbed (not in new backend) ──
  listFailedScans(
    _opts: {
      from?: string;
      to?: string;
      branchId?: string;
      reason?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      employeeId?: string;
      contractorEmployeeId?: string;
      limit?: number;
    } = {},
  ): Observable<FailedScanRow[]> {
    return of([]);
  }

  failedScanStats(
    _opts: {
      from?: string;
      to?: string;
      branchId?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    } = {},
  ): Observable<FailedScanStats> {
    return of({
      total: 0,
      bySubject: { employee: 0, contractor: 0, unknown: 0 },
      byReason: [],
      byBranch: [],
      byDay: [],
      byHour: [],
      byDevice: [],
      byMode: [],
      byDayOfWeek: [],
    });
  }

  exportFailedScansCsv(
    _opts: {
      from?: string;
      to?: string;
      branchId?: string;
      reason?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      employeeId?: string;
      contractorEmployeeId?: string;
    } = {},
  ): Observable<Blob> {
    return of(new Blob());
  }

  exportFailedScanStatsCsv(
    _opts: {
      from?: string;
      to?: string;
      branchId?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      topSubjectsLimit?: number;
    } = {},
  ): Observable<Blob> {
    return of(new Blob());
  }

  topFailedScanSubjects(
    _opts: {
      from?: string;
      to?: string;
      branchId?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      limit?: number;
      minCount?: number;
    } = {},
  ): Observable<TopFailedScanSubjectRow[]> {
    return of([]);
  }

  listFaceFailureAlerts(_limit = 20): Observable<FaceFailureAlertRow[]> {
    return of([]);
  }

  // ── Operator-supervised kiosk enrollment tickets ──
  createKioskEnrollTicket(body: CreateKioskEnrollTicketBody): Observable<KioskEnrollTicket> {
    return this.http.post<KioskEnrollTicket>(`${this.base}/enrollment/kiosk/ticket`, body);
  }

  getKioskEnrollTicket(id: string): Observable<KioskEnrollTicket> {
    return this.http.get<KioskEnrollTicket>(`${this.base}/enrollment/kiosk/tickets/${id}`);
  }

  cancelKioskEnrollTicket(id: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/enrollment/kiosk/tickets/${id}/cancel`, {});
  }

  listKioskEnrollTickets(status?: KioskEnrollTicketStatus): Observable<KioskEnrollTicket[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.http.get<KioskEnrollTicket[]>(`${this.base}/enrollment/kiosk/tickets${qs}`);
  }

  reviewKioskEnrollTicket(
    _id: string,
    _body: { decision: 'APPROVED' | 'REJECTED'; reason?: string },
  ): Observable<{ ok: true; status: 'COMPLETED' | 'REJECTED' }> {
    // Admin review removed — tickets auto-approve in new design
    return throwError(() => new Error('Not implemented'));
  }
}

export type KioskEnrollTicketStatus =
  | 'PENDING'
  | 'REVIEW_PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CreateKioskEnrollTicketBody {
  deviceId: string;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  employeeId?: string;
  contractorEmployeeId?: string;
  subjectName: string;
  subjectCode?: string;
  notes?: string;
}

export interface KioskEnrollTicket {
  id: string;
  clientId: string;
  branchId: string | null;
  deviceId: string;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  employeeId: string | null;
  contractorEmployeeId: string | null;
  subjectName: string;
  subjectCode: string | null;
  status: KioskEnrollTicketStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  capturedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  embeddingModel: string | null;
  matchScoreSelf: number | null;
  photoUrl: string | null;
  notes: string | null;
}

export interface ContractorForBranchRow {
  contractorUserId: string;
  contractorName: string | null;
  contractorEmail: string | null;
  employeeCount: string;
}

export interface ContractorPunchRow {
  id: string;
  contractorEmployeeId: string;
  contractorEmployeeName: string | null;
  contractorUserId: string | null;
  contractorName: string | null;
  branchId: string | null;
  punchTime: string;
  direction: string;
  source: string;
  deviceId: string | null;
  photoUrl: string | null;
  matchScore: string | null;
  livenessScore: string | null;
  captureLat: string | null;
  captureLng: string | null;
}

export interface FailedScanRow {
  id: string;
  attemptedAt: string;
  branchId: string | null;
  deviceId: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  contractorEmployeeId: string | null;
  contractorEmployeeName: string | null;
  contractorUserId: string | null;
  contractorName: string | null;
  reason: string;
  reasonDetail: string | null;
  matchScore: string | null;
  livenessScore: string | null;
  captureLat: string | null;
  captureLng: string | null;
}

export interface FailedScanStats {
  total: number;
  bySubject: { employee: number; contractor: number; unknown: number };
  byReason: Array<{ reason: string; count: number }>;
  byBranch: Array<{
    branchId: string | null;
    branchName: string | null;
    count: number;
  }>;
  byDay: Array<{ day: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  byDevice: Array<{
    deviceId: string | null;
    deviceLabel: string | null;
    mode: string | null;
    lastFailedAt: string | null;
    count: number;
  }>;
  byMode: Array<{ mode: string; count: number }>;
  byDayOfWeek: Array<{ dow: number; count: number }>;
}

export interface TopFailedScanSubjectRow {
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  contractorEmployeeId: string | null;
  contractorEmployeeName: string | null;
  contractorName: string | null;
  count: number;
  avgMatchScore: number | null;
  lastFailedAt: string | null;
  topReason: string | null;
}

export interface FaceFailureAlertRow {
  id: string;
  branchId: string | null;
  title: string;
  message: string | null;
  priority: string;
  createdAt: string;
}
