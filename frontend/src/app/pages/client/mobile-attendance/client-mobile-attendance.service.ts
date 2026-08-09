import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
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
  private faceDeskBase = `${environment.apiBaseUrl}/api/v1/facedesk`;

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

  listFederatedEnrollment(
    limit?: number,
  ): Observable<FederatedEnrollmentResponse> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.http.get<FederatedEnrollmentResponse>(
      `${this.base}/enrollment-federation${qs}`,
    );
  }

  actOnFederatedReview(
    queue: 'MOBILE_BORDERLINE' | 'FACEDESK_VERIFICATION',
    itemId: string,
    body: {
      action: 'APPROVE' | 'REJECT';
      note?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    },
  ): Observable<{ ok: true; decision?: string; status?: string }> {
    return this.http.post<{ ok: true; decision?: string; status?: string }>(
      `${this.base}/review-federation/${queue}/${itemId}/action`,
      body,
    );
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
  listReenrollRequests(status: ReenrollRequestStatus = 'PENDING'): Observable<ReenrollRequest[]> {
    return this.http.get<ReenrollRequest[]>(`${this.base}/enrollment/reenroll-requests`, {
      params: { status },
    });
  }

  reviewReenrollRequest(
    id: string,
    body: ReviewReenrollBody,
  ): Observable<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    return this.http.post<{ ok: true; status: 'APPROVED' | 'REJECTED' }>(
      `${this.base}/enrollment/reenroll-requests/${id}/review`,
      body,
    );
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

  // ── Contractor re-enrollment approval queue ──
  listContractorReenrollRequests(
    status: ReenrollRequestStatus = 'PENDING',
  ): Observable<ContractorReenrollRequest[]> {
    return this.http.get<ContractorReenrollRequest[]>(
      `${this.base}/enrollment/contractor-reenroll-requests`,
      { params: { status } },
    );
  }

  reviewContractorReenrollRequest(
    id: string,
    body: ReviewReenrollBody,
  ): Observable<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    return this.http.post<{ ok: true; status: 'APPROVED' | 'REJECTED' }>(
      `${this.base}/enrollment/contractor-reenroll-requests/${id}/review`,
      body,
    );
  }

  // ── Branch-portal contractor list (aggregated from client contractor-employees API) ──
  listContractorsForBranch(branchId?: string): Observable<ContractorForBranchRow[]> {
    const params: Record<string, string> = { isActive: 'true' };
    if (branchId) params['branchId'] = branchId;
    return this.http
      .get<{ data: Array<{ contractorUserId: string; name: string }>; total: number }>(
        '/api/v1/client/contractor-employees',
        { params },
      )
      .pipe(
        map((res) => {
          const counts = new Map<string, { name: string | null; count: number }>();
          for (const row of res.data ?? []) {
            if (!row.contractorUserId) continue;
            const cur = counts.get(row.contractorUserId);
            if (cur) {
              cur.count += 1;
            } else {
              counts.set(row.contractorUserId, { name: row.name ?? null, count: 1 });
            }
          }
          return [...counts.entries()]
            .map(([contractorUserId, v]) => ({
              contractorUserId,
              contractorName: v.name,
              contractorEmail: null,
              employeeCount: String(v.count),
            }))
            .sort((a, b) =>
              (a.contractorName ?? a.contractorUserId).localeCompare(
                b.contractorName ?? b.contractorUserId,
              ),
            );
        }),
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

  // ── Punch review queue (two-level face decision) ──
  listReviewPunches(
    opts: { status?: string; branchId?: string; limit?: number } = {},
  ): Observable<ReviewPunchRow[]> {
    const parts: string[] = [];
    if (opts.status) parts.push(`status=${encodeURIComponent(opts.status)}`);
    if (opts.branchId) parts.push(`branchId=${encodeURIComponent(opts.branchId)}`);
    if (opts.limit) parts.push(`limit=${opts.limit}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http.get<ReviewPunchRow[]>(`${this.base}/punches/review${qs}`);
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
      `${this.base}/review-federation${qs}`,
    );
  }

  reviewPunch(
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    punchId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string,
  ): Observable<{ ok: true; decision: string }> {
    return this.http.post<{ ok: true; decision: string }>(
      `${this.base}/punches/review/${subjectType.toLowerCase()}/${punchId}`,
      { action, note },
    );
  }

  // ── Failed scans — backed by the active FaceDesk failure pipeline ──
  listFailedScans(
    opts: {
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
    return this.fetchFaceDeskFailures(opts).pipe(
      map((rows) => rows.slice(0, Math.max(1, Math.min(opts.limit ?? 500, 2000)))),
    );
  }

  failedScanStats(
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    } = {},
  ): Observable<FailedScanStats> {
    return this.fetchFaceDeskFailures(opts).pipe(map((rows) => this.buildFailureStats(rows)));
  }

  exportFailedScansCsv(
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      reason?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      employeeId?: string;
      contractorEmployeeId?: string;
    } = {},
  ): Observable<Blob> {
    return this.fetchFaceDeskFailures(opts).pipe(
      map((rows) =>
        this.csvBlob(
          [
            'Attempted At',
            'Subject Type',
            'Employee Code',
            'Employee Name',
            'Contractor',
            'Reason',
            'Match Score',
            'Branch',
            'Device',
          ],
          rows.map((r) => [
            r.attemptedAt,
            this.failureSubject(r),
            r.employeeCode ?? '',
            r.employeeName ?? r.contractorEmployeeName ?? '',
            r.contractorName ?? '',
            r.reason,
            r.matchScore ?? '',
            r.branchName ?? r.branchId ?? '',
            r.deviceLabel ?? r.deviceId ?? '',
          ]),
        ),
      ),
    );
  }

  exportFailedScanStatsCsv(
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      topSubjectsLimit?: number;
    } = {},
  ): Observable<Blob> {
    return this.failedScanStats(opts).pipe(
      map((stats) =>
        this.csvBlob(
          ['Metric', 'Value'],
          [
            ['Total failures', stats.total],
            ['Employees', stats.bySubject.employee],
            ['Contractors', stats.bySubject.contractor],
            ['Unknown', stats.bySubject.unknown],
            ...stats.byReason.map((r) => [`Reason: ${r.reason}`, r.count]),
            ...stats.byBranch.map((r) => [
              `Branch: ${r.branchName ?? r.branchId ?? 'Unknown'}`,
              r.count,
            ]),
          ],
        ),
      ),
    );
  }

  topFailedScanSubjects(
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
      limit?: number;
      minCount?: number;
    } = {},
  ): Observable<TopFailedScanSubjectRow[]> {
    return this.fetchFaceDeskFailures(opts).pipe(
      map((rows) =>
        this.buildTopFailureSubjects(rows)
          .filter((r) => r.count >= Math.max(0, opts.minCount ?? 0))
          .slice(0, Math.max(1, Math.min(opts.limit ?? 10, 100))),
      ),
    );
  }

  listFaceFailureAlerts(limit = 20): Observable<FaceFailureAlertRow[]> {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const SPIKE_THRESHOLD = 8;
    return this.fetchFaceDeskFailures({
      from: from.toISOString(),
      to: to.toISOString(),
    }).pipe(
      map((rows) => {
        const buckets = new Map<
          string,
          { count: number; branchId: string | null; reason: string; hour: string }
        >();
        for (const row of rows) {
          const hour = (row.attemptedAt ?? '').slice(0, 13);
          const key = `${row.branchId ?? 'all'}:${row.reason}:${hour}`;
          const bucket = buckets.get(key) ?? {
            count: 0,
            branchId: row.branchId,
            reason: row.reason,
            hour,
          };
          bucket.count += 1;
          buckets.set(key, bucket);
        }
        const alerts: FaceFailureAlertRow[] = [];
        for (const [, bucket] of buckets) {
          if (bucket.count < SPIKE_THRESHOLD) continue;
          const reasonLabel = bucket.reason.replace(/_/g, ' ').toLowerCase();
          alerts.push({
            id: `${bucket.branchId ?? 'all'}:${bucket.reason}:${bucket.hour}`,
            branchId: bucket.branchId,
            title: `${bucket.count} ${reasonLabel} failures in one hour`,
            message: `Spike at ${bucket.hour}:00 UTC — review the failures dashboard.`,
            priority: 'HIGH',
            createdAt: `${bucket.hour}:00:00.000Z`,
          });
        }
        return alerts
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, Math.max(1, Math.min(limit, 50)));
      }),
    );
  }

  private fetchFaceDeskFailures(opts: {
    from?: string;
    to?: string;
    branchId?: string;
    reason?: string;
    subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    employeeId?: string;
    contractorEmployeeId?: string;
  }): Observable<FaceDeskFailedScanRow[]> {
    const parts: string[] = [];
    if (opts.from) parts.push(`from=${encodeURIComponent(opts.from)}`);
    if (opts.to) parts.push(`to=${encodeURIComponent(opts.to)}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return this.http
      .get<FaceDeskFailedScanRow[]>(`${this.faceDeskBase}/reports/failed${qs}`)
      .pipe(
        map((rows) =>
          (rows ?? []).filter((row) => {
            if (opts.branchId && row.branchId !== opts.branchId) return false;
            if (opts.reason && row.reason !== opts.reason) return false;
            if (opts.subjectType && this.failureSubject(row) !== opts.subjectType) return false;
            if (opts.employeeId && row.employeeId !== opts.employeeId) return false;
            if (
              opts.contractorEmployeeId &&
              row.contractorEmployeeId !== opts.contractorEmployeeId
            )
              return false;
            return true;
          }),
        ),
      );
  }

  private failureSubject(row: FailedScanRow): 'EMPLOYEE' | 'CONTRACTOR' | 'UNKNOWN' {
    if (row.employeeId) return 'EMPLOYEE';
    if (row.contractorEmployeeId) return 'CONTRACTOR';
    return 'UNKNOWN';
  }

  private buildFailureStats(rows: FaceDeskFailedScanRow[]): FailedScanStats {
    const countBy = <K>(values: K[]): Map<K, number> => {
      const result = new Map<K, number>();
      values.forEach((value) => result.set(value, (result.get(value) ?? 0) + 1));
      return result;
    };
    const subjects = rows.map((row) => this.failureSubject(row));
    const reasons = countBy(rows.map((row) => row.reason));
    const days = countBy(rows.map((row) => row.attemptedAt.slice(0, 10)));
    const hours = countBy(rows.map((row) => new Date(row.attemptedAt).getHours()));
    const dows = countBy(rows.map((row) => new Date(row.attemptedAt).getDay()));
    const modes = countBy(rows.map((row) => row.mode ?? 'KIOSK'));

    const branchGroups = new Map<string, { branchId: string | null; branchName: string | null; count: number }>();
    const deviceGroups = new Map<string, FailedScanStats['byDevice'][number]>();
    rows.forEach((row) => {
      const branchKey = row.branchId ?? '';
      const branch = branchGroups.get(branchKey) ?? {
        branchId: row.branchId,
        branchName: row.branchName ?? null,
        count: 0,
      };
      branch.count += 1;
      branchGroups.set(branchKey, branch);

      const deviceKey = row.deviceId ?? '';
      const device = deviceGroups.get(deviceKey) ?? {
        deviceId: row.deviceId,
        deviceLabel: row.deviceLabel ?? null,
        mode: row.mode ?? 'KIOSK',
        lastFailedAt: row.attemptedAt,
        count: 0,
      };
      device.count += 1;
      if (!device.lastFailedAt || row.attemptedAt > device.lastFailedAt) {
        device.lastFailedAt = row.attemptedAt;
      }
      deviceGroups.set(deviceKey, device);
    });
    const descending = <T extends { count: number }>(items: T[]) =>
      items.sort((a, b) => b.count - a.count);
    return {
      total: rows.length,
      bySubject: {
        employee: subjects.filter((s) => s === 'EMPLOYEE').length,
        contractor: subjects.filter((s) => s === 'CONTRACTOR').length,
        unknown: subjects.filter((s) => s === 'UNKNOWN').length,
      },
      byReason: descending([...reasons].map(([reason, count]) => ({ reason, count }))),
      byBranch: descending([...branchGroups.values()]),
      byDay: [...days].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hours.get(hour) ?? 0 })),
      byDevice: descending([...deviceGroups.values()]),
      byMode: descending([...modes].map(([mode, count]) => ({ mode, count }))),
      byDayOfWeek: Array.from({ length: 7 }, (_, dow) => ({ dow, count: dows.get(dow) ?? 0 })),
    };
  }

  private buildTopFailureSubjects(rows: FaceDeskFailedScanRow[]): TopFailedScanSubjectRow[] {
    const groups = new Map<string, FailureSubjectAccumulator>();
    rows.forEach((row) => {
      const subjectType = this.failureSubject(row);
      if (subjectType === 'UNKNOWN') return;
      const id = subjectType === 'EMPLOYEE' ? row.employeeId : row.contractorEmployeeId;
      if (!id) return;
      const key = `${subjectType}:${id}`;
      const group = groups.get(key) ?? {
        subjectType,
        row,
        count: 0,
        scoreTotal: 0,
        scoreCount: 0,
        reasons: new Map<string, number>(),
        lastFailedAt: row.attemptedAt,
      };
      group.count += 1;
      const score = Number(row.matchScore);
      if (row.matchScore != null && Number.isFinite(score)) {
        group.scoreTotal += score;
        group.scoreCount += 1;
      }
      group.reasons.set(row.reason, (group.reasons.get(row.reason) ?? 0) + 1);
      if (row.attemptedAt > group.lastFailedAt) group.lastFailedAt = row.attemptedAt;
      groups.set(key, group);
    });
    return [...groups.values()]
      .map((group) => ({
        subjectType: group.subjectType,
        employeeId: group.row.employeeId,
        employeeCode: group.row.employeeCode,
        employeeName: group.row.employeeName,
        contractorEmployeeId: group.row.contractorEmployeeId,
        contractorEmployeeName: group.row.contractorEmployeeName,
        contractorName: group.row.contractorName,
        count: group.count,
        avgMatchScore: group.scoreCount ? group.scoreTotal / group.scoreCount : null,
        lastFailedAt: group.lastFailedAt,
        topReason: [...group.reasons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private csvBlob(headers: string[], rows: Array<Array<string | number>>): Blob {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const text = [headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
    return new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
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

export interface FederatedReviewSummary {
  mobileBorderlinePending: number;
  facedeskVerificationPending: number;
  totalPending: number;
}

export interface FederatedReviewItem {
  queue: 'MOBILE_BORDERLINE' | 'FACEDESK_VERIFICATION';
  itemId: string;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  displayName: string | null;
  displayCode: string | null;
  branchId: string | null;
  punchTime: string;
  status: string;
  issueLabel: string;
  portalPath:
    | '/client/mobile-attendance?tab=review'
    | '/client/facedesk?tab=review';
}

export interface FederatedReviewResponse {
  summary: FederatedReviewSummary;
  items: FederatedReviewItem[];
  mobileItems: FederatedReviewItem[];
  facedeskItems: FederatedReviewItem[];
}

export type FederatedEnrollmentOverallStatus =
  | 'FULLY_ENROLLED'
  | 'PARTIAL'
  | 'PENDING'
  | 'DEACTIVATED';

export interface FederatedEnrollmentMobileState {
  isEnrolled: boolean;
  isActive: boolean;
  embeddingModel: string | null;
  enrolledAt: string | null;
  portalPath: '/client/mobile-attendance?tab=status';
}

export interface FederatedEnrollmentFaceDeskState {
  enrollmentStatus: 'PENDING' | 'ENROLLED' | 'BLOCKED' | 'DEACTIVATED';
  enrolledAt: string | null;
  portalPath: '/client/facedesk?tab=pending';
}

export interface FederatedEnrollmentItem {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string | null;
  mobile: FederatedEnrollmentMobileState | null;
  facedesk: FederatedEnrollmentFaceDeskState | null;
  overallStatus: FederatedEnrollmentOverallStatus;
}

export interface FederatedEnrollmentSummary {
  totalEmployees: number;
  mobileEnrolledActive: number;
  facedeskEnrolled: number;
  bothEnrolled: number;
  pendingEither: number;
}

export interface FederatedEnrollmentResponse {
  summary: FederatedEnrollmentSummary;
  items: FederatedEnrollmentItem[];
}

export interface ReviewPunchRow {
  id: string;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  subjectId: string;
  subjectName: string | null;
  subjectCode: string | null;
  branchId: string | null;
  deviceId: string | null;
  punchTime: string;
  matchCosine: string | null;
  matchThreshold: string | null;
  matchMargin: string | null;
  livenessScore: string | null;
  photoUrl: string | null;
  decision: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
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

interface FaceDeskFailedScanRow extends FailedScanRow {
  branchName?: string | null;
  deviceLabel?: string | null;
  mode?: string | null;
}

interface FailureSubjectAccumulator {
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  row: FaceDeskFailedScanRow;
  count: number;
  scoreTotal: number;
  scoreCount: number;
  reasons: Map<string, number>;
  lastFailedAt: string;
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
