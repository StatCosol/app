import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type MobileDeviceMode = 'KIOSK' | 'ESS';

export interface MobileAttendanceDevice {
  id: string;
  clientId: string;
  branchId: string | null;
  mode: MobileDeviceMode;
  deviceLabel: string | null;
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
  private base = `${environment.apiBaseUrl}/api/v1/client/mobile-attendance`;

  constructor(private http: HttpClient) {}

  // Devices
  listDevices(): Observable<MobileAttendanceDevice[]> {
    return this.http.get<MobileAttendanceDevice[]>(`${this.base}/devices`);
  }

  registerDevice(body: RegisterMobileDeviceBody): Observable<MobileAttendanceDevice> {
    return this.http.post<MobileAttendanceDevice>(`${this.base}/devices`, body);
  }

  revokeDevice(id: string): Observable<MobileAttendanceDevice> {
    return this.http.delete<MobileAttendanceDevice>(`${this.base}/devices/${id}`);
  }

  hardDeleteDevice(id: string): Observable<{ ok: true; id: string }> {
    return this.http.delete<{ ok: true; id: string }>(`${this.base}/devices/${id}/permanent`);
  }

  // Enrollment
  enrollFace(body: EnrollFaceBody): Observable<FaceEnrollment> {
    return this.http.post<FaceEnrollment>(`${this.base}/enroll`, body);
  }

  listEnrollments(): Observable<EnrollmentStatusRow[]> {
    return this.http.get<EnrollmentStatusRow[]>(`${this.base}/enrollments`);
  }

  deactivateEnrollment(employeeId: string, reason?: string): Observable<FaceEnrollment> {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return this.http.delete<FaceEnrollment>(`${this.base}/enroll/${employeeId}${qs}`);
  }

  // Re-enrollment approval queue (Phase 3e)
  listReenrollRequests(status: ReenrollRequestStatus = 'PENDING'): Observable<ReenrollRequest[]> {
    return this.http.get<ReenrollRequest[]>(`${this.base}/reenroll-requests?status=${status}`);
  }

  reviewReenrollRequest(
    id: string,
    body: ReviewReenrollBody,
  ): Observable<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    return this.http.post<{ ok: true; status: 'APPROVED' | 'REJECTED' }>(
      `${this.base}/reenroll-requests/${id}/review`,
      body,
    );
  }

  // ── Contractor face enrollment (Phase 4a) ──
  enrollContractorFace(
    body: EnrollContractorFaceBody,
  ): Observable<ContractorFaceEnrollment> {
    return this.http.post<ContractorFaceEnrollment>(
      `${this.base}/contractors/enroll`,
      body,
    );
  }

  listContractorEnrollments(): Observable<ContractorEnrollmentStatusRow[]> {
    return this.http.get<ContractorEnrollmentStatusRow[]>(
      `${this.base}/contractors/enrollments`,
    );
  }

  deactivateContractorEnrollment(
    contractorEmployeeId: string,
    reason?: string,
  ): Observable<ContractorFaceEnrollment> {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return this.http.delete<ContractorFaceEnrollment>(
      `${this.base}/contractors/enroll/${contractorEmployeeId}${qs}`,
    );
  }

  // ── Contractor re-enrollment approval queue (Phase 4c) ──
  listContractorReenrollRequests(
    status: ReenrollRequestStatus = 'PENDING',
  ): Observable<ContractorReenrollRequest[]> {
    return this.http.get<ContractorReenrollRequest[]>(
      `${this.base}/contractors/reenroll-requests?status=${status}`,
    );
  }

  reviewContractorReenrollRequest(
    id: string,
    body: ReviewReenrollBody,
  ): Observable<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    return this.http.post<{ ok: true; status: 'APPROVED' | 'REJECTED' }>(
      `${this.base}/contractors/reenroll-requests/${id}/review`,
      body,
    );
  }

  // ── Branch-portal contractor attendance (Phase 4d) ──
  listContractorsForBranch(
    branchId?: string,
  ): Observable<ContractorForBranchRow[]> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return this.http.get<ContractorForBranchRow[]>(
      `${this.base}/contractors/for-branch${qs}`,
    );
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
    if (opts.contractorUserId)
      parts.push(`contractorUserId=${encodeURIComponent(opts.contractorUserId)}`);
    if (opts.limit) parts.push(`limit=${opts.limit}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http.get<ContractorPunchRow[]>(
      `${this.base}/contractors/punches${qs}`,
    );
  }
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
