import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BiometricService } from '../biometric/biometric.service';

const SHIFT_START = process.env.FD_SHIFT_START ?? '09:30';
const SHIFT_END = process.env.FD_SHIFT_END ?? '18:00';

export interface ReportRange {
  from?: string;
  to?: string;
  branchIds?: string[];
}

/**
 * FaceDesk V2 reports + payroll sync. Payroll only ever receives approved
 * attendance (MARKED auto-accepts + admin-APPROVED), pushed through the shared
 * biometric ingest pipeline which is idempotent, so re-syncing is safe.
 */
@Injectable()
export class FaceDeskReportsService {
  private readonly logger = new Logger(FaceDeskReportsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly biometric: BiometricService,
  ) {}

  private range(opts: ReportRange): { from: string; to: string } {
    const to = opts.to ?? new Date().toISOString();
    const from =
      opts.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    return { from, to };
  }

  private branchClause(
    params: unknown[],
    branchIds: string[] | undefined,
    col: string,
  ): string {
    if (branchIds === undefined) return '';
    if (branchIds.length === 0) return 'AND FALSE';
    params.push(branchIds);
    return `AND ${col} = ANY($${params.length}::uuid[])`;
  }

  /** Approved punches in range, employee + branch joined. */
  async dailyAttendance(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'a.branch_id');
    return this.dataSource.query(
      `SELECT a.attendance_id AS "attendanceId", e.employee_code AS "employeeCode",
              e.name AS "employeeName", a.branch_id AS "branchId",
              a.punch_type AS "punchType", a.punch_time AS "punchTime",
              a.confidence_score AS "confidence", a.attendance_status AS "status"
         FROM facedesk_attendance_logs a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time < $3
          AND a.attendance_status IN ('MARKED','APPROVED') ${branch}
        ORDER BY a.punch_time DESC LIMIT 5000`,
      params,
    );
  }

  /** Per-employee first-in / last-out / punch count for the range. */
  async employeeSummary(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'a.branch_id');
    return this.dataSource.query(
      `SELECT e.employee_code AS "employeeCode", e.name AS "employeeName",
              a.branch_id AS "branchId",
              date_trunc('day', a.punch_time) AS "day",
              min(a.punch_time) AS "firstIn", max(a.punch_time) AS "lastOut",
              count(*)::int AS "punches"
         FROM facedesk_attendance_logs a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time < $3
          AND a.attendance_status IN ('MARKED','APPROVED') ${branch}
        GROUP BY e.employee_code, e.name, a.branch_id, date_trunc('day', a.punch_time)
        ORDER BY "day" DESC, e.employee_code ASC LIMIT 5000`,
      params,
    );
  }

  async branchSummary(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'branch_id');
    return this.dataSource.query(
      `SELECT branch_id AS "branchId",
              count(DISTINCT employee_id)::int AS "employees",
              count(*)::int AS "punches"
         FROM facedesk_attendance_logs
        WHERE client_id = $1 AND punch_time >= $2 AND punch_time < $3
          AND attendance_status IN ('MARKED','APPROVED') ${branch}
        GROUP BY branch_id ORDER BY "punches" DESC`,
      params,
    );
  }

  /** Late = first-in after SHIFT_START; early-going = last-out before SHIFT_END. */
  async lateComing(clientId: string, opts: ReportRange) {
    return this.shiftDeviations(clientId, opts, 'LATE');
  }
  async earlyGoing(clientId: string, opts: ReportRange) {
    return this.shiftDeviations(clientId, opts, 'EARLY');
  }
  private async shiftDeviations(
    clientId: string,
    opts: ReportRange,
    kind: 'LATE' | 'EARLY',
  ) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'a.branch_id');
    const rows = await this.dataSource.query<
      Array<{
        employeeCode: string;
        employeeName: string;
        day: Date;
        firstIn: Date;
        lastOut: Date;
      }>
    >(
      `SELECT e.employee_code AS "employeeCode", e.name AS "employeeName",
              date_trunc('day', a.punch_time) AS "day",
              min(a.punch_time) AS "firstIn", max(a.punch_time) AS "lastOut"
         FROM facedesk_attendance_logs a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time < $3
          AND a.attendance_status IN ('MARKED','APPROVED') ${branch}
        GROUP BY e.employee_code, e.name, date_trunc('day', a.punch_time)`,
      params,
    );
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    return rows.filter((r) =>
      kind === 'LATE'
        ? hhmm(new Date(r.firstIn)) > SHIFT_START
        : hhmm(new Date(r.lastOut)) < SHIFT_END,
    );
  }

  /** Enrolled employees with no approved punch in range. */
  async absent(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'e.branch_id');
    return this.dataSource.query(
      `SELECT e.employee_code AS "employeeCode", e.name AS "employeeName",
              e.branch_id AS "branchId"
         FROM employees e
         JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.enrollment_status = 'ENROLLED'
        WHERE e.client_id = $1 AND e.is_active = true ${branch}
          AND NOT EXISTS (
            SELECT 1 FROM facedesk_attendance_logs a
             WHERE a.employee_id = e.id AND a.client_id = e.client_id
               AND a.punch_time >= $2 AND a.punch_time < $3
               AND a.attendance_status IN ('MARKED','APPROVED')
          )
        ORDER BY e.employee_code ASC`,
      params,
    );
  }

  async failedAttempts(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'f.branch_id');
    return this.dataSource.query(
      `SELECT f.attempt_id AS id, f.attempted_at AS "attemptedAt",
              f.branch_id AS "branchId", b.branch_name AS "branchName",
              f.device_id AS "deviceId", d.device_name AS "deviceLabel",
              'KIOSK'::text AS mode,
              e.id AS "employeeId", e.employee_code AS "employeeCode",
              e.name AS "employeeName",
              ce.id AS "contractorEmployeeId",
              ce.name AS "contractorEmployeeName",
              ce.contractor_user_id AS "contractorUserId",
              cu.name AS "contractorName",
              f.reason, NULL::text AS "reasonDetail",
              f.best_confidence AS "matchScore",
              NULL::numeric AS "livenessScore",
              NULL::numeric AS "captureLat", NULL::numeric AS "captureLng"
         FROM facedesk_attendance_failed_attempts f
         LEFT JOIN employees e
           ON e.id = f.best_employee_id AND e.client_id = f.client_id
         LEFT JOIN contractor_employees ce
           ON ce.id = f.best_employee_id AND ce.client_id = f.client_id
         LEFT JOIN users cu ON cu.id = ce.contractor_user_id
         LEFT JOIN branches b ON b.id = f.branch_id
         LEFT JOIN facedesk_kiosk_devices d ON d.device_id = f.device_id
        WHERE f.client_id = $1 AND f.attempted_at >= $2 AND f.attempted_at < $3 ${branch}
        ORDER BY f.attempted_at DESC LIMIT 2000`,
      params,
    );
  }

  async duplicateReport(clientId: string) {
    return this.dataSource.query(
      `SELECT alert_id AS "alertId", new_employee_id AS "newEmployeeId",
              matched_employee_id AS "matchedEmployeeId", similarity_score AS "similarity",
              status, created_at AS "createdAt"
         FROM facedesk_face_duplicate_alerts
        WHERE client_id = $1 ORDER BY created_at DESC LIMIT 2000`,
      [clientId],
    );
  }

  async pendingEnrollment(clientId: string, branchIds?: string[]) {
    const params: unknown[] = [clientId];
    const branch = this.branchClause(params, branchIds, 'e.branch_id');
    return this.dataSource.query(
      `SELECT e.employee_code AS "employeeCode", e.name AS "employeeName",
              e.branch_id AS "branchId",
              COALESCE(p.enrollment_status, 'PENDING') AS "status"
         FROM employees e
         LEFT JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.client_id = e.client_id
        WHERE e.client_id = $1 AND e.is_active = true
          AND (p.enrollment_status IS NULL OR p.enrollment_status <> 'ENROLLED') ${branch}
        ORDER BY e.employee_code ASC`,
      params,
    );
  }

  async deviceSyncReport(clientId: string) {
    return this.dataSource.query(
      `SELECT s.sync_id AS "syncId", s.device_id AS "deviceId", d.device_name AS "deviceName",
              s.synced_count AS "synced", s.duplicate_skipped AS "duplicateSkipped",
              s.failed_count AS "failed", s.sync_status AS "status", s.created_at AS "createdAt"
         FROM facedesk_device_sync_logs s
         LEFT JOIN facedesk_kiosk_devices d ON d.device_id = s.device_id
        WHERE s.client_id = $1 ORDER BY s.created_at DESC LIMIT 1000`,
      [clientId],
    );
  }

  /** Payroll export rows (approved attendance) for the range. */
  async payrollExport(clientId: string, opts: ReportRange) {
    return this.dailyAttendance(clientId, opts);
  }

  /**
   * Push approved attendance into the payroll/attendance pipeline (PayDek).
   * Idempotent via the biometric ingest's (client, code, time, device) key.
   */
  async pushToPayroll(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const rows = await this.dataSource.query<
      Array<{
        employeeCode: string;
        punchTime: Date;
        punchType: 'IN' | 'OUT' | 'AUTO';
        deviceId: string | null;
        branchId: string | null;
      }>
    >(
      `SELECT e.employee_code AS "employeeCode", a.punch_time AS "punchTime",
              a.punch_type AS "punchType", a.device_id AS "deviceId", a.branch_id AS "branchId"
         FROM facedesk_attendance_logs a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time < $3
          AND a.attendance_status IN ('MARKED','APPROVED')
          AND NOT EXISTS (
            SELECT 1 FROM facedesk_attendance_review_queue rq
             WHERE rq.client_id = a.client_id
               AND rq.attendance_id = a.attendance_id
               AND rq.status = 'PENDING'
          )
        ORDER BY a.punch_time ASC LIMIT 10000`,
      [clientId, from, to],
    );
    if (rows.length === 0) return { pushed: 0, received: 0 };

    const items = rows.map((r) => ({
      employeeCode: r.employeeCode,
      punchTime: new Date(r.punchTime).toISOString(),
      direction: r.punchType,
      deviceId: r.deviceId ?? 'facedesk',
      branchId: r.branchId ?? undefined,
      source: 'MOBILE_KIOSK' as const,
    }));
    const result = await this.biometric.ingest(clientId, items, true);
    this.logger.log(
      `payroll push: client=${clientId} received=${result.received} inserted=${result.inserted}`,
    );
    return { pushed: result.inserted, received: result.received };
  }
}
