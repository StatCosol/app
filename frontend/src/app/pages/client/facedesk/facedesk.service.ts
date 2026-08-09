import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { FederatedReviewResponse } from '../mobile-attendance/client-mobile-attendance.service';

export interface FaceDeskDashboard {
  totalEmployees: number;
  enrolledEmployees: number;
  pendingEnrollment: number;
  todayPresent: number;
  todayAbsent: number;
  failedAttemptsToday: number;
  duplicateAlertsPending: number;
  reviewQueuePending: number;
  devicesOnline: number;
  devicesOffline: number;
  lastSyncTime: string | null;
}

export interface FaceDeskSettings {
  matchConfidencePct: number;
  retryConfidencePct: number;
  duplicatePct: number;
  minFaceSamples: number;
  frameCaptureCount: number;
  livenessRequired: boolean;
  offlineSyncEnabled: boolean;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  acceptCosine: number;
  retryCosine: number;
  duplicateCosine: number;
}

export interface DuplicateAlert {
  alertId: string;
  newEmployeeId: string;
  newEmployeeName?: string | null;
  newEmployeeCode?: string | null;
  newSubjectType?: 'EMPLOYEE' | 'CONTRACTOR' | null;
  newBranchId?: string | null;
  matchedEmployeeId: string;
  matchedEmployeeName?: string | null;
  matchedEmployeeCode?: string | null;
  matchedSubjectType?: 'EMPLOYEE' | 'CONTRACTOR' | null;
  matchedBranchId?: string | null;
  similarityScore: string;
  status: string;
  createdAt: string;
}

export interface ReviewItem {
  reviewId: string;
  subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
  employeeId: string | null;
  employeeName?: string | null;
  employeeCode?: string | null;
  attendanceId: string | null;
  contractorPunchId?: string | null;
  photoUrl?: string | null;
  hasEnrolledPhoto?: boolean;
  punchType?: string | null;
  punchTime?: string | null;
  branchId?: string | null;
  issueType: string;
  confidenceScore: string | null;
  status: string;
  adminRemarks: string | null;
  createdAt: string;
}

export interface PendingEnrollmentRow {
  employeeId?: string;
  employeeCode: string;
  employeeName?: string;
  name?: string;
  branchId: string | null;
  enrollmentStatus?: string;
  status?: string;
  subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
  department?: string | null;
  designation?: string | null;
  qualityScore?: string | number | null;
  livenessStatus?: string | null;
  duplicateStatus?: string | null;
  pinConfigured?: boolean;
  enrolledAt?: string | null;
}

export interface FaceDeskDevice {
  deviceId: string;
  deviceName: string;
  branchId: string | null;
  location: string | null;
  deviceStatus: string;
  mode: string;
  lastSyncTime: string | null;
  appVersion: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FaceDeskService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/facedesk`;
  private readonly mobileAttendanceBase = `${environment.apiBaseUrl}/api/v1/mobile-attendance`;

  constructor(private http: HttpClient) {}

  dashboard(): Observable<FaceDeskDashboard> {
    return this.http.get<FaceDeskDashboard>(`${this.base}/dashboard`);
  }

  getSettings(): Observable<FaceDeskSettings> {
    return this.http.get<FaceDeskSettings>(`${this.base}/settings`);
  }

  updateSettings(patch: Partial<FaceDeskSettings>): Observable<FaceDeskSettings> {
    return this.http.put<FaceDeskSettings>(`${this.base}/settings`, patch);
  }

  // Enrollment
  /** Set/reset an employee's attendance PIN by code; returns the plaintext once. */
  setAttendancePin(employeeCode: string): Observable<{ employeeId: string; employeeCode: string; pin: string }> {
    return this.http.post<{ employeeId: string; employeeCode: string; pin: string }>(
      `${this.base}/enrollment/set-pin`,
      { employeeCode },
    );
  }

  pendingEnrollment(
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Observable<PendingEnrollmentRow[]> {
    return this.http.get<PendingEnrollmentRow[]>(
      `${this.base}/enrollment/pending?subjectType=${subjectType}`,
    );
  }

  enrolledEmployees(
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Observable<PendingEnrollmentRow[]> {
    return this.http.get<PendingEnrollmentRow[]>(
      `${this.base}/enrollment/enrolled?subjectType=${subjectType}`,
    );
  }

  /** Delete a subject's enrollment (face profile + samples); they return to pending. */
  deleteEnrollment(
    employeeId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(
      `${this.base}/enrollment/${employeeId}?subjectType=${subjectType}`,
    );
  }

  createEnrollTicket(
    employeeId: string,
    deviceId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Observable<{ ticketId: string; status: string }> {
    return this.http.post<{ ticketId: string; status: string }>(
      `${this.base}/enroll-tickets`,
      { employeeId, deviceId, subjectType },
    );
  }

  enrollTickets(status = 'PENDING'): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/enroll-tickets?status=${encodeURIComponent(status)}`);
  }

  // Duplicate alerts
  duplicateAlerts(status = 'PENDING'): Observable<DuplicateAlert[]> {
    return this.http.get<DuplicateAlert[]>(
      `${this.base}/admin/duplicate-alerts?status=${encodeURIComponent(status)}`,
    );
  }
  actOnDuplicate(
    alertId: string,
    action: 'APPROVE' | 'REJECT' | 'FALSE_ALERT',
    remarks?: string,
  ): Observable<{ ok: true; status: string }> {
    return this.http.post<{ ok: true; status: string }>(
      `${this.base}/admin/duplicate-alerts/${alertId}/action`,
      { action, remarks },
    );
  }

  // Review queue
  reviewQueue(status = 'PENDING'): Observable<ReviewItem[]> {
    return this.http.get<ReviewItem[]>(
      `${this.base}/admin/review-queue?status=${encodeURIComponent(status)}`,
    );
  }

  listFederatedReview(
    opts: { mobileStatus?: string; facedeskStatus?: string; limit?: number } = {},
  ): Observable<FederatedReviewResponse> {
    const parts: string[] = [];
    if (opts.mobileStatus) {
      parts.push(`mobileStatus=${encodeURIComponent(opts.mobileStatus)}`);
    }
    if (opts.facedeskStatus) {
      parts.push(`facedeskStatus=${encodeURIComponent(opts.facedeskStatus)}`);
    }
    if (opts.limit) parts.push(`limit=${opts.limit}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http.get<FederatedReviewResponse>(
      `${this.mobileAttendanceBase}/review-federation${qs}`,
    );
  }

  /**
   * Scoped, authorization-checked URL for a review item's captured photo.
   * The raw /uploads/face-photos path is blocked for biometric photos, so the
   * portal must load them through this endpoint.
   */
  reviewPhotoUrl(reviewId: string): string {
    return `${this.base}/admin/review-queue/${reviewId}/photo`;
  }
  reviewEnrollmentPhotoUrl(reviewId: string): string {
    return `${this.base}/admin/review-queue/${reviewId}/enrollment-photo`;
  }
  actOnReview(
    reviewId: string,
    action: 'APPROVE' | 'REJECT' | 'REASSIGN' | 'FALSE_ALERT',
    opts: { remarks?: string; reassignEmployeeId?: string } = {},
  ): Observable<{ ok: true; status: string }> {
    return this.http.post<{ ok: true; status: string }>(
      `${this.base}/admin/review-queue/${reviewId}/action`,
      { action, ...opts },
    );
  }

  // Reports
  report(kind: string, from?: string, to?: string): Observable<any[]> {
    const parts: string[] = [];
    if (from) parts.push(`from=${encodeURIComponent(from)}`);
    if (to) parts.push(`to=${encodeURIComponent(to)}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http.get<any[]>(`${this.base}/reports/${kind}${qs}`);
  }

  // Payroll
  pushToPayroll(from?: string, to?: string): Observable<{ pushed: number; received: number }> {
    return this.http.post<{ pushed: number; received: number }>(
      `${this.base}/payroll/sync`,
      { from, to },
    );
  }

  // Devices
  devices(): Observable<FaceDeskDevice[]> {
    return this.http.get<FaceDeskDevice[]>(`${this.base}/devices`);
  }
  provisionDevice(body: {
    deviceName: string;
    branchId?: string;
    location?: string;
    mode?: 'ATTENDANCE' | 'ENROLLMENT';
    adminPin?: string;
  }): Observable<FaceDeskDevice & { installToken: string }> {
    return this.http.post<FaceDeskDevice & { installToken: string }>(`${this.base}/devices`, body);
  }
  revokeDevice(deviceId: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/devices/${deviceId}/revoke`, {});
  }

  deleteDevice(deviceId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.base}/devices/${deviceId}`);
  }

  createCorrection(body: {
    employeeId: string;
    correctionType: 'ADD' | 'EDIT' | 'DELETE';
    attendanceId?: string;
    newPunchTime?: string;
    newPunchType?: 'IN' | 'OUT';
    reason?: string;
  }): Observable<{ ok: true; correctionId: string }> {
    return this.http.post<{ ok: true; correctionId: string }>(
      `${this.base}/admin/corrections`,
      body,
    );
  }
}
