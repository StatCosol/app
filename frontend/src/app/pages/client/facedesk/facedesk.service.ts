import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

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
  acceptCosine: number;
  retryCosine: number;
  duplicateCosine: number;
}

export interface DuplicateAlert {
  alertId: string;
  newEmployeeId: string;
  matchedEmployeeId: string;
  similarityScore: string;
  status: string;
  createdAt: string;
}

export interface ReviewItem {
  reviewId: string;
  employeeId: string | null;
  attendanceId: string | null;
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
}

export interface FaceDeskDevice {
  deviceId: string;
  deviceName: string;
  branchId: string | null;
  location: string | null;
  deviceStatus: string;
  mode: string;
  installToken: string | null;
  lastSyncTime: string | null;
  appVersion: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FaceDeskService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/facedesk`;

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
  pendingEnrollment(): Observable<PendingEnrollmentRow[]> {
    return this.http.get<PendingEnrollmentRow[]>(`${this.base}/enrollment/pending`);
  }

  createEnrollTicket(employeeId: string, deviceId: string): Observable<{ ticketId: string; status: string }> {
    return this.http.post<{ ticketId: string; status: string }>(
      `${this.base}/enroll-tickets`,
      { employeeId, deviceId },
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
  }): Observable<FaceDeskDevice> {
    return this.http.post<FaceDeskDevice>(`${this.base}/devices`, body);
  }
  revokeDevice(deviceId: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/devices/${deviceId}/revoke`, {});
  }

  deleteDevice(deviceId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.base}/devices/${deviceId}`);
  }
}
