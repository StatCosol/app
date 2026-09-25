import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BiometricService } from '../biometric/biometric.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { ContractorDaysService } from '../biometric/contractor-days.service';

const DEFAULT_SHIFT_START = process.env.FD_SHIFT_START ?? '09:30';
const DEFAULT_SHIFT_END = process.env.FD_SHIFT_END ?? '18:00';
/** Minutes of worked time that count as one full day. Short days go to review. */
const FULL_DAY_MINUTES = Number(process.env.FD_FULL_DAY_MINUTES ?? 540); // 9h

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
    private readonly settings: FaceDeskSettingsService,
    private readonly contractorDaysSvc: ContractorDaysService,
  ) {}

  private range(opts: ReportRange): { from: string; to: string } {
    const to = opts.to ?? new Date().toISOString();
    const from =
      opts.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    return { from, to };
  }

  /**
   * Every punch the kiosk took for this client in the range, whichever roster
   * the subject belongs to.
   *
   * Employees land in facedesk_attendance_logs; contractor workers land in
   * contractor_biometric_punches. Reading only the first left these reports
   * describing a kiosk without its contractors — on the live register that is
   * 533 contractor punches against 443 employee ones, at a site where 95 of
   * the enrolled subjects are contractors.
   *
   * A contractor punch has no review gate: it is written once the face is
   * matched, so there is no status to filter on. Employee punches keep theirs.
   *
   * Takes $1 = clientId, $2 = from, $3 = to; filter branches on kp.branch_id.
   */
  private static readonly KIOSK_PUNCHES = `
    kiosk_punch AS (
      SELECT a.employee_id AS subject_id, 'EMPLOYEE' AS subject_type,
             e.employee_code, e.name AS subject_name, a.branch_id,
             a.punch_time, a.punch_type, a.confidence_score AS confidence
        FROM facedesk_attendance_logs a
        JOIN employees e ON e.id = a.employee_id
       WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time < $3
         AND a.attendance_status IN ('MARKED','APPROVED')
      UNION ALL
      SELECT p.contractor_employee_id, 'CONTRACTOR',
             ce.employee_code, ce.name, p.branch_id,
             p.punch_time, p.direction, p.match_score
        FROM contractor_biometric_punches p
        JOIN contractor_employees ce ON ce.id = p.contractor_employee_id
       WHERE p.client_id = $1 AND p.punch_time >= $2 AND p.punch_time < $3
         -- A punch still awaiting face review, or refused at it, is not
         -- attendance. Counting it would credit a day that never passed
         -- review, and would drop the worker out of the absent report.
         -- Same gate ContractorDaysService applies to the wage sheet.
         AND p.decision IN ('AUTO', 'REVIEW_APPROVED')
    )`;

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
    const branch = this.branchClause(params, opts.branchIds, 'kp.branch_id');
    return this.dataSource.query(
      `WITH ${FaceDeskReportsService.KIOSK_PUNCHES}
        SELECT kp.employee_code AS "employeeCode", kp.subject_name AS "employeeName",
               kp.subject_type AS "subjectType", kp.branch_id AS "branchId",
               kp.punch_type AS "punchType", kp.punch_time AS "punchTime",
               kp.confidence AS "confidence"
          FROM kiosk_punch kp
         WHERE TRUE ${branch}
         ORDER BY kp.punch_time DESC LIMIT 5000`,
      params,
    );
  }

  /** Per-employee first-in / last-out / punch count for the range. */
  async employeeSummary(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'kp.branch_id');
    return this.dataSource.query(
      `WITH ${FaceDeskReportsService.KIOSK_PUNCHES}
        SELECT kp.employee_code AS "employeeCode", kp.subject_name AS "employeeName",
               kp.subject_type AS "subjectType", kp.branch_id AS "branchId",
               date_trunc('day', kp.punch_time) AS "day",
               min(kp.punch_time) AS "firstIn", max(kp.punch_time) AS "lastOut",
               count(*)::int AS "punches"
          FROM kiosk_punch kp
         WHERE TRUE ${branch}
         GROUP BY kp.employee_code, kp.subject_name, kp.subject_type, kp.branch_id,
                  date_trunc('day', kp.punch_time)
         ORDER BY "day" DESC, kp.employee_code ASC LIMIT 5000`,
      params,
    );
  }

  /**
   * Per employee-per-day worked hours from ALL punches. Punches strictly
   * alternate IN/OUT within an IST business day (see PunchDirectionService), so
   * worked time = sum of each IN→next-OUT interval. A day with ≥ FULL_DAY_MINUTES
   * counts as a full day automatically; a shorter day is held as PENDING_REVIEW
   * until a branch user approves (→ full day) or rejects (→ 0), recorded in
   * facedesk_day_reviews.
   */
  async workedHoursSummary(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'kp.branch_id');
    const rows = await this.dataSource.query<
      Array<{
        employeeCode: string;
        employeeName: string;
        branchName: string | null;
        day: string;
        punches: number;
        firstIn: Date;
        lastOut: Date;
        workedSeconds: number;
        punchList: string;
        reviewDecision: 'APPROVED' | 'HALF_DAY' | 'REJECTED' | null;
      }>
    >(
      `WITH ${FaceDeskReportsService.KIOSK_PUNCHES},
       punches AS (
         SELECT kp.subject_id, kp.subject_type, kp.employee_code, kp.subject_name,
                kp.branch_id, kp.punch_time, kp.punch_type,
                (kp.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS biz_day,
                LEAD(kp.punch_time) OVER w AS next_time,
                LEAD(kp.punch_type) OVER w AS next_type
           FROM kiosk_punch kp
          WHERE TRUE ${branch}
         WINDOW w AS (
           PARTITION BY kp.subject_id, (kp.punch_time AT TIME ZONE 'Asia/Kolkata')::date
           ORDER BY kp.punch_time
         )
       )
       SELECT p.employee_code AS "employeeCode", p.subject_name AS "employeeName",
              p.subject_type AS "subjectType",
              b.branch_name AS "branchName", p.biz_day AS "day",
              count(*)::int AS "punches",
              min(p.punch_time) AS "firstIn", max(p.punch_time) AS "lastOut",
              COALESCE(SUM(CASE WHEN p.punch_type = 'IN' AND p.next_type = 'OUT'
                    THEN EXTRACT(EPOCH FROM (p.next_time - p.punch_time)) END), 0)::int
                AS "workedSeconds",
              string_agg(
                to_char(p.punch_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || ' ' || p.punch_type,
                ', ' ORDER BY p.punch_time
              ) AS "punchList",
              dr.decision AS "reviewDecision"
         FROM punches p
         LEFT JOIN branches b ON b.id = p.branch_id
         LEFT JOIN facedesk_day_reviews dr
           ON dr.client_id = $1 AND dr.employee_id = p.subject_id AND dr.work_date = p.biz_day
        GROUP BY p.employee_code, p.subject_name, p.subject_type, b.branch_name,
                 p.biz_day, dr.decision
        ORDER BY p.biz_day DESC, p.employee_code ASC LIMIT 5000`,
      params,
    );
    return rows.map((r) => this.decorateWorkedDay(r));
  }

  /** Worked-hours → status/day-unit, and a readable H:MM string. */
  private decorateWorkedDay(r: {
    employeeCode: string;
    employeeName: string;
    branchName: string | null;
    day: string;
    punches: number;
    punchList: string;
    workedSeconds: number;
    reviewDecision: 'APPROVED' | 'HALF_DAY' | 'REJECTED' | null;
  }) {
    const workedSeconds = Number(r.workedSeconds) || 0;
    const fullByHours = workedSeconds >= FULL_DAY_MINUTES * 60;
    let status:
      | 'FULL'
      | 'APPROVED'
      | 'HALF_DAY'
      | 'REJECTED'
      | 'PENDING_REVIEW';
    let dayUnit: number;
    if (fullByHours) {
      status = 'FULL';
      dayUnit = 1;
    } else if (r.reviewDecision === 'APPROVED') {
      status = 'APPROVED';
      dayUnit = 1;
    } else if (r.reviewDecision === 'HALF_DAY') {
      status = 'HALF_DAY';
      dayUnit = 0.5;
    } else if (r.reviewDecision === 'REJECTED') {
      status = 'REJECTED';
      dayUnit = 0;
    } else {
      status = 'PENDING_REVIEW';
      dayUnit = 0;
    }
    const h = Math.floor(workedSeconds / 3600);
    const m = Math.round((workedSeconds % 3600) / 60);
    return {
      day:
        typeof r.day === 'string'
          ? r.day
          : new Date(r.day).toISOString().slice(0, 10),
      employeeCode: r.employeeCode,
      employeeName: r.employeeName,
      branch: r.branchName ?? '',
      punches: r.punches,
      punchList: r.punchList,
      workedHours: `${h}:${String(m).padStart(2, '0')}`,
      dayUnit,
      status,
    };
  }

  async branchSummary(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(params, opts.branchIds, 'kp.branch_id');
    return this.dataSource.query(
      `WITH ${FaceDeskReportsService.KIOSK_PUNCHES}
        SELECT kp.branch_id AS "branchId",
               count(DISTINCT kp.subject_id)::int AS "people",
               count(DISTINCT kp.subject_id) FILTER (WHERE kp.subject_type = 'EMPLOYEE')::int
                 AS "employees",
               count(DISTINCT kp.subject_id) FILTER (WHERE kp.subject_type = 'CONTRACTOR')::int
                 AS "contractors",
               count(*)::int AS "punches"
          FROM kiosk_punch kp
         WHERE TRUE ${branch}
         GROUP BY kp.branch_id ORDER BY "punches" DESC`,
      params,
    );
  }

  private async shiftBounds(clientId: string): Promise<{
    shiftStart: string;
    shiftEnd: string;
  }> {
    const eff = await this.settings.getEffective(clientId);
    return {
      shiftStart: eff.shiftStartTime?.trim() || DEFAULT_SHIFT_START,
      shiftEnd: eff.shiftEndTime?.trim() || DEFAULT_SHIFT_END,
    };
  }

  /** Late = first-in after shift start; early-going = last-out before shift end. */
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
    const branch = this.branchClause(params, opts.branchIds, 'kp.branch_id');
    const rows = await this.dataSource.query<
      Array<{
        employeeCode: string;
        employeeName: string;
        day: Date;
        firstIn: Date;
        lastOut: Date;
      }>
    >(
      `WITH ${FaceDeskReportsService.KIOSK_PUNCHES}
        SELECT kp.employee_code AS "employeeCode", kp.subject_name AS "employeeName",
               kp.subject_type AS "subjectType",
               date_trunc('day', kp.punch_time) AS "day",
               min(kp.punch_time) AS "firstIn", max(kp.punch_time) AS "lastOut"
          FROM kiosk_punch kp
         WHERE TRUE ${branch}
         GROUP BY kp.employee_code, kp.subject_name, kp.subject_type,
                  date_trunc('day', kp.punch_time)`,
      params,
    );
    const { shiftStart, shiftEnd } = await this.shiftBounds(clientId);
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    return rows.filter((r) =>
      kind === 'LATE'
        ? hhmm(new Date(r.firstIn)) > shiftStart
        : hhmm(new Date(r.lastOut)) < shiftEnd,
    );
  }

  /**
   * Enrolled subjects with no punch in range — contractor workers included,
   * since an absent contractor is the one the site most needs to hear about.
   */
  async absent(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    const params: unknown[] = [clientId, from, to];
    const branch = this.branchClause(
      params,
      opts.branchIds,
      'enrolled.branch_id',
    );
    return this.dataSource.query(
      `WITH ${FaceDeskReportsService.KIOSK_PUNCHES},
       enrolled AS (
         SELECT e.id AS subject_id, 'EMPLOYEE' AS subject_type,
                e.employee_code, e.name AS subject_name, e.branch_id
           FROM employees e
           JOIN facedesk_employee_face_profiles p
             ON p.employee_id = e.id AND p.client_id = e.client_id
            AND p.subject_type = 'EMPLOYEE' AND p.enrollment_status = 'ENROLLED'
          WHERE e.client_id = $1 AND e.is_active = true
         UNION ALL
         SELECT ce.id, 'CONTRACTOR', ce.employee_code, ce.name, ce.branch_id
           FROM contractor_employees ce
           JOIN facedesk_employee_face_profiles p
             ON p.employee_id = ce.id AND p.client_id = ce.client_id
            AND p.subject_type = 'CONTRACTOR' AND p.enrollment_status = 'ENROLLED'
          WHERE ce.client_id = $1
            AND (ce.is_active IS TRUE OR ce.status IN ('ACTIVE', 'PENDING_DELETE'))
       )
        SELECT enrolled.employee_code AS "employeeCode",
               enrolled.subject_name AS "employeeName",
               enrolled.subject_type AS "subjectType",
               enrolled.branch_id AS "branchId"
          FROM enrolled
         WHERE TRUE ${branch}
           AND NOT EXISTS (
             SELECT 1 FROM kiosk_punch kp WHERE kp.subject_id = enrolled.subject_id
           )
         ORDER BY enrolled.employee_code ASC`,
      params,
    );
  }

  /**
   * Days worked per contractor worker, from the punches this kiosk took.
   *
   * The client pays these workers, so the figure their wages are computed
   * from belongs in front of them. contractor-days has always produced it and
   * the CLIENT role has always been allowed to read it — but nothing in the
   * product called that endpoint, so the number existed and no one could see
   * it.
   *
   * Workers holding attendance but no employee_code cannot be matched to a
   * wage line, so they come back flagged rather than quietly left out: those
   * are the ones who would otherwise go unpaid.
   */
  async contractorDays(clientId: string, opts: ReportRange) {
    const { from, to } = this.range(opts);
    // A branch-scoped user sees their own branches' workers and no others:
    // this report carries names, codes, punch dates and days worked.
    if (opts.branchIds?.length === 0) return [];
    const summary = await this.contractorDaysSvc.summarise(
      clientId,
      from,
      to,
      undefined,
      opts.branchIds,
    );
    // unpayable is a subset of rows, not a separate list, so the flag is
    // derived per row — concatenating the two emitted each of those workers
    // twice, once payable and once not.
    const unpayable = new Set(
      summary.unpayable.map((r) => r.contractorEmployeeId),
    );
    return summary.rows.map((r) => ({
      ...r,
      payable: !unpayable.has(r.contractorEmployeeId),
    }));
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
