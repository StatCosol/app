import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import { BiometricService } from '../biometric/biometric.service';
import {
  FaceDeskAttendanceEntity,
  FaceDeskAuditEntity,
  FaceDeskCorrectionEntity,
  FaceDeskDuplicateAlertEntity,
  FaceDeskProfileEntity,
  FaceDeskReviewQueueEntity,
  FaceDeskSampleEntity,
} from './entities/facedesk.entities';
import {
  DayReviewActionDto,
  DuplicateActionDto,
  ManualCorrectionDto,
  ReviewActionDto,
} from './facedesk.dto';

/** Worked minutes that count as a full day; short days need branch approval. */
const FULL_DAY_MINUTES = Number(process.env.FD_FULL_DAY_MINUTES ?? 540); // 9h

@Injectable()
export class FaceDeskAdminService {
  constructor(
    @InjectRepository(FaceDeskDuplicateAlertEntity)
    private readonly dupeRepo: Repository<FaceDeskDuplicateAlertEntity>,
    @InjectRepository(FaceDeskReviewQueueEntity)
    private readonly reviewRepo: Repository<FaceDeskReviewQueueEntity>,
    @InjectRepository(FaceDeskAttendanceEntity)
    private readonly attRepo: Repository<FaceDeskAttendanceEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    @InjectRepository(FaceDeskProfileEntity)
    private readonly profileRepo: Repository<FaceDeskProfileEntity>,
    @InjectRepository(FaceDeskSampleEntity)
    private readonly sampleRepo: Repository<FaceDeskSampleEntity>,
    @InjectRepository(FaceDeskCorrectionEntity)
    private readonly correctionRepo: Repository<FaceDeskCorrectionEntity>,
    @InjectRepository(FaceDeskAuditEntity)
    private readonly auditRepo: Repository<FaceDeskAuditEntity>,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly biometric: BiometricService,
  ) {}

  private readonly logger = new Logger(FaceDeskAdminService.name);

  /**
   * On HR approval of a flagged EMPLOYEE punch, reflect it into the biometric /
   * daily-attendance pipeline (clean punches are ingested at capture; flagged
   * ones wait until here). Best-effort; idempotent on (client, code, time).
   */
  private async ingestApprovedPunch(
    clientId: string,
    attendanceId: string,
  ): Promise<void> {
    const [row] = await this.attRepo.manager.query(
      `SELECT e.employee_code AS "employeeCode", a.punch_time AS "punchTime",
              a.punch_type AS "punchType", a.device_id AS "deviceId",
              a.branch_id AS "branchId"
         FROM facedesk_attendance_logs a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.attendance_id = $1 AND a.client_id = $2 LIMIT 1`,
      [attendanceId, clientId],
    );
    if (!row?.employeeCode) return;
    try {
      await this.biometric.ingest(
        clientId,
        [
          {
            employeeCode: row.employeeCode,
            punchTime: new Date(row.punchTime).toISOString(),
            direction: row.punchType,
            deviceId: row.deviceId ?? 'facedesk',
            branchId: row.branchId ?? undefined,
            source: 'MOBILE_KIOSK',
          },
        ],
        true,
      );
    } catch (err) {
      this.logger.warn(
        `biometric ingest on approve failed for ${row.employeeCode}: ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Serve a review item's captured face photo, scoped to the caller. Biometric
   * photos are blocked on the raw /uploads path (main.ts) for authorization, so
   * the portal must fetch them through here — we load the review row, enforce
   * client + branch scope, and stream the file from storage.
   */
  async getReviewPhoto(
    clientId: string,
    reviewId: string,
    branchIds: string[] | null,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const [row] = await this.reviewRepo.manager.query(
      `SELECT rq.branch_id AS "branchId",
              COALESCE(a.photo_url, cp.photo_url) AS "photoUrl"
         FROM facedesk_attendance_review_queue rq
         LEFT JOIN facedesk_attendance_logs a ON a.attendance_id = rq.attendance_id
         LEFT JOIN contractor_biometric_punches cp ON cp.id = rq.contractor_punch_id
        WHERE rq.review_id = $1 AND rq.client_id = $2
        LIMIT 1`,
      [reviewId, clientId],
    );
    if (!row) throw new NotFoundException('Review item not found');
    // A non-null branchIds means a branch-scoped caller (an empty array = no
    // branches). Require the item to carry a branch that is one of theirs —
    // and reject a null-branch item too — matching actOnReview()'s scoping so
    // biometric photos never leak outside the caller's branches.
    if (branchIds != null) {
      if (!row.branchId || !branchIds.includes(row.branchId)) {
        throw new NotFoundException('Review item not found');
      }
    }
    if (!row.photoUrl) return null;
    return this.photoStorage.readPhoto(row.photoUrl);
  }

  /** Serve the enrolled reference image for the subject on a review item. */
  async getReviewEnrollmentPhoto(
    clientId: string,
    reviewId: string,
    branchIds: string[] | null,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const [row] = await this.reviewRepo.manager.query(
      `SELECT rq.branch_id AS "branchId",
              (SELECT s.image_path
                 FROM facedesk_employee_face_profiles p
                 JOIN facedesk_employee_face_samples s
                   ON s.profile_id = p.profile_id
                WHERE p.client_id = rq.client_id
                  AND p.employee_id = rq.employee_id
                  AND s.image_path IS NOT NULL
                ORDER BY (s.sample_type = 'FRONT') DESC,
                         s.quality_score DESC NULLS LAST,
                         s.created_at DESC
                LIMIT 1) AS "photoUrl"
         FROM facedesk_attendance_review_queue rq
        WHERE rq.review_id = $1 AND rq.client_id = $2
        LIMIT 1`,
      [reviewId, clientId],
    );
    if (!row) throw new NotFoundException('Review item not found');
    if (branchIds != null) {
      if (!row.branchId || !branchIds.includes(row.branchId)) {
        throw new NotFoundException('Review item not found');
      }
    }
    if (!row.photoUrl) return null;
    return this.photoStorage.readPhoto(row.photoUrl);
  }

  private audit(
    clientId: string,
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    detail: Record<string, unknown> = {},
  ) {
    return this.auditRepo.save({
      clientId,
      actorId,
      action,
      entityType,
      entityId,
      detail,
    });
  }

  // ── Duplicate alerts ──────────────────────────────────────────────────────
  listDuplicateAlerts(
    clientId: string,
    status = 'PENDING',
    allowedBranchIds: string[] | null = null,
  ) {
    if (allowedBranchIds?.length === 0) return Promise.resolve([]);
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      // A branch verifier only sees alerts for enrollments at their branch.
      branchFilter = `AND COALESCE(ne.branch_id, nc.branch_id, np.branch_id) = ANY($${params.length}::uuid[])`;
    }
    return this.dupeRepo.manager.query(
      // Enrolled photos live in facedesk_employee_face_samples.image_path (the
      // profiles table has no photo column), so probe the samples table — the
      // same signal the enrolled-photo endpoint serves.
      `SELECT da.alert_id AS "alertId",
              da.new_employee_id AS "newEmployeeId",
              da.matched_employee_id AS "matchedEmployeeId",
              da.similarity_score AS "similarityScore",
              da.status AS "status", da.reviewed_by AS "reviewedBy",
              da.reviewed_at AS "reviewedAt",
              da.admin_remarks AS "adminRemarks",
              da.created_at AS "createdAt",
              np.subject_type AS "newSubjectType",
              COALESCE(ne.name, nc.name) AS "newEmployeeName",
              ne.employee_code AS "newEmployeeCode",
              COALESCE(ne.branch_id, nc.branch_id, np.branch_id) AS "newBranchId",
              mp.subject_type AS "matchedSubjectType",
              COALESCE(me.name, mc.name) AS "matchedEmployeeName",
              me.employee_code AS "matchedEmployeeCode",
              COALESCE(me.branch_id, mc.branch_id, mp.branch_id) AS "matchedBranchId",
              -- Only advertise a viewable face when the enrolled-photo endpoint
              -- can actually serve it: the subject must be ENROLLED (the endpoint
              -- filters on enrollment_status), otherwise the "View face" link 404s
              -- (e.g. a blocked/new duplicate that has a sample but isn't enrolled).
              (np.enrollment_status = 'ENROLLED' AND EXISTS (
                SELECT 1 FROM facedesk_employee_face_samples s
                 WHERE s.profile_id = np.profile_id AND s.image_path IS NOT NULL
              )) AS "hasNewPhoto",
              (mp.enrollment_status = 'ENROLLED' AND EXISTS (
                SELECT 1 FROM facedesk_employee_face_samples s
                 WHERE s.profile_id = mp.profile_id AND s.image_path IS NOT NULL
              )) AS "hasMatchedPhoto"
         FROM facedesk_face_duplicate_alerts da
         LEFT JOIN facedesk_employee_face_profiles np
           ON np.client_id = da.client_id AND np.employee_id = da.new_employee_id
         LEFT JOIN employees ne
           ON np.subject_type = 'EMPLOYEE' AND ne.id = da.new_employee_id
          AND ne.client_id = da.client_id
         LEFT JOIN contractor_employees nc
           ON np.subject_type = 'CONTRACTOR' AND nc.id = da.new_employee_id
          AND nc.client_id = da.client_id
         LEFT JOIN facedesk_employee_face_profiles mp
           ON mp.client_id = da.client_id AND mp.employee_id = da.matched_employee_id
         LEFT JOIN employees me
           ON mp.subject_type = 'EMPLOYEE' AND me.id = da.matched_employee_id
          AND me.client_id = da.client_id
         LEFT JOIN contractor_employees mc
           ON mp.subject_type = 'CONTRACTOR' AND mc.id = da.matched_employee_id
          AND mc.client_id = da.client_id
        WHERE da.client_id = $1 AND da.status = $2 ${branchFilter}
        ORDER BY da.created_at DESC
        LIMIT 200`,
      params,
    );
  }

  async actOnDuplicate(
    clientId: string,
    alertId: string,
    actorId: string,
    dto: DuplicateActionDto,
  ) {
    const alert = await this.dupeRepo.findOne({ where: { alertId, clientId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.status !== 'PENDING') {
      throw new BadRequestException(`Alert already ${alert.status}`);
    }
    const status =
      dto.action === 'APPROVE'
        ? 'APPROVED'
        : dto.action === 'FALSE_ALERT'
          ? 'FALSE_ALERT'
          : 'REJECTED';
    await this.dupeRepo.update(
      { alertId },
      {
        status,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        adminRemarks: dto.remarks ?? null,
      },
    );
    // The two detection paths leave the profile in opposite states, so they
    // need opposite resolutions.
    //
    // BLOCK — enrollment was refused and no template stored. Clearing the
    // alert reopens enrollment (they must re-enroll to store a template);
    // confirming the duplicate leaves the profile blocked as it already is.
    //
    // REVIEW — the profile is already ENROLLED with a valid template. Clearing
    // the alert must LEAVE it enrolled (forcing PENDING here would destroy a
    // working enrollment over a false positive); confirming the duplicate must
    // REVOKE it, otherwise a confirmed duplicate stays enrolled and can punch.
    const cleared = dto.action !== 'REJECT';
    if (alert.detectionBand === 'REVIEW') {
      await this.profileRepo.update(
        { employeeId: alert.newEmployeeId, clientId },
        cleared
          ? { duplicateStatus: 'CLEAR' }
          : { duplicateStatus: 'FLAGGED', enrollmentStatus: 'BLOCKED' },
      );
    } else if (cleared) {
      // BLOCK band: the capture that triggered the alert was kept against a
      // BLOCKED profile, so approving it completes the enrollment outright —
      // the admin has just confirmed this face may enrol, and sending the
      // worker back to the kiosk to be photographed again achieves nothing.
      // Only fall back to PENDING for a legacy alert raised before captures
      // were retained, where there is genuinely no template to activate.
      const profile = await this.profileRepo.findOne({
        where: { employeeId: alert.newEmployeeId, clientId },
      });
      const hasTemplate = !!profile?.faceTemplate?.length;
      await this.profileRepo.update(
        { employeeId: alert.newEmployeeId, clientId },
        {
          duplicateStatus: 'APPROVED',
          enrollmentStatus: hasTemplate ? 'ENROLLED' : 'PENDING',
        },
      );
    } else if (alert.detectionBand === 'BLOCK') {
      // Rejected: this face was refused, so do not keep the biometric data
      // captured for it. The profile row stays (as BLOCKED) for the audit
      // trail, but the template and samples are shredded.
      const profile = await this.profileRepo.findOne({
        where: { employeeId: alert.newEmployeeId, clientId },
      });
      if (profile) {
        await this.sampleRepo.delete({ profileId: profile.profileId });
        await this.profileRepo.update(
          { profileId: profile.profileId },
          { faceTemplate: null as any, enrollmentStatus: 'BLOCKED' },
        );
      }
    }
    await this.audit(
      clientId,
      actorId,
      `DUPLICATE_${dto.action}`,
      'DUPLICATE_ALERT',
      alertId,
      {
        newEmployeeId: alert.newEmployeeId,
        matchedEmployeeId: alert.matchedEmployeeId,
      },
    );
    return { ok: true, status };
  }

  // ── Review queue ──────────────────────────────────────────────────────────
  /**
   * Enriched with the employee's name/code and the linked attendance photo so
   * the reviewer can verify the face against the claimed identity. Optionally
   * branch-scoped: a branch user only sees their own branch's items.
   */
  listReviewQueue(
    clientId: string,
    status = 'PENDING',
    allowedBranchIds: string[] | null = null,
  ) {
    if (allowedBranchIds?.length === 0) return Promise.resolve([]);
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      branchFilter = `AND rq.branch_id = ANY($${params.length}::uuid[])`;
    }
    return this.reviewRepo.manager.query(
      `SELECT rq.review_id AS "reviewId", rq.employee_id AS "employeeId",
              CASE WHEN rq.contractor_punch_id IS NULL THEN 'EMPLOYEE' ELSE 'CONTRACTOR' END
                AS "subjectType",
              COALESCE(e.name, ce.name) AS "employeeName",
              e.employee_code AS "employeeCode",
              rq.attendance_id AS "attendanceId",
              rq.contractor_punch_id AS "contractorPunchId",
              COALESCE(a.photo_url, cp.photo_url) AS "photoUrl",
              EXISTS (
                SELECT 1
                  FROM facedesk_employee_face_profiles fp
                  JOIN facedesk_employee_face_samples fs
                    ON fs.profile_id = fp.profile_id
                 WHERE fp.client_id = rq.client_id
                   AND fp.employee_id = rq.employee_id
                   AND fs.image_path IS NOT NULL
              ) AS "hasEnrolledPhoto",
              COALESCE(a.punch_time, cp.punch_time) AS "punchTime",
              COALESCE(a.punch_type, cp.direction) AS "punchType",
              rq.branch_id AS "branchId", rq.issue_type AS "issueType",
              rq.confidence_score AS "confidenceScore", rq.status AS "status",
              rq.admin_remarks AS "adminRemarks", rq.created_at AS "createdAt"
         FROM facedesk_attendance_review_queue rq
         LEFT JOIN employees e ON e.id = rq.employee_id
         LEFT JOIN facedesk_attendance_logs a ON a.attendance_id = rq.attendance_id
         LEFT JOIN contractor_biometric_punches cp ON cp.id = rq.contractor_punch_id
         LEFT JOIN contractor_employees ce ON ce.id = cp.contractor_employee_id
        WHERE rq.client_id = $1 AND rq.status = $2 ${branchFilter}
        ORDER BY rq.created_at DESC
        LIMIT 200`,
      params,
    );
  }

  async actOnReview(
    clientId: string,
    reviewId: string,
    actorId: string,
    dto: ReviewActionDto,
    allowedBranchIds: string[] | null = null,
  ) {
    const review = await this.reviewRepo.findOne({
      where: { reviewId, clientId },
    });
    if (!review) throw new NotFoundException('Review item not found');
    // Branch user may only act on items in their own branch.
    if (
      allowedBranchIds !== null &&
      (review.branchId === null || !allowedBranchIds.includes(review.branchId))
    ) {
      throw new NotFoundException('Review item not found');
    }
    if (review.status !== 'PENDING') {
      throw new BadRequestException(`Review already ${review.status}`);
    }
    const newStatus =
      dto.action === 'APPROVE'
        ? 'APPROVED'
        : dto.action === 'REJECT'
          ? 'REJECTED'
          : dto.action === 'REASSIGN'
            ? 'REASSIGNED'
            : 'FALSE_ALERT';

    // Apply to the linked attendance record where relevant.
    if (review.attendanceId) {
      if (dto.action === 'APPROVE') {
        await this.attRepo.update(
          { attendanceId: review.attendanceId },
          { attendanceStatus: 'APPROVED' },
        );
      } else if (dto.action === 'REJECT') {
        await this.attRepo.update(
          { attendanceId: review.attendanceId },
          { attendanceStatus: 'REJECTED' },
        );
      } else if (dto.action === 'REASSIGN' && dto.reassignEmployeeId) {
        await this.attRepo.update(
          { attendanceId: review.attendanceId },
          { employeeId: dto.reassignEmployeeId, attendanceStatus: 'APPROVED' },
        );
      }
      // Approved/reassigned → now reflect into daily attendance + payroll
      // (queried after the update so a reassign uses the new employee's code).
      if (
        dto.action === 'APPROVE' ||
        (dto.action === 'REASSIGN' && dto.reassignEmployeeId)
      ) {
        await this.ingestApprovedPunch(clientId, review.attendanceId);
      }
    }
    if (review.contractorPunchId) {
      if (dto.action === 'APPROVE') {
        await this.contractorPunchRepo.update(
          { id: review.contractorPunchId, clientId },
          {
            decision: 'REVIEW_APPROVED',
            reviewedBy: actorId,
            reviewedAt: new Date(),
            reviewNote: dto.remarks ?? null,
          },
        );
      } else if (dto.action === 'REJECT') {
        await this.contractorPunchRepo.update(
          { id: review.contractorPunchId, clientId },
          {
            decision: 'REVIEW_REJECTED',
            reviewedBy: actorId,
            reviewedAt: new Date(),
            reviewNote: dto.remarks ?? null,
          },
        );
      } else {
        throw new BadRequestException(
          'Contractor FaceDesk reviews support only approve or reject',
        );
      }
    }

    // Point 4 — adaptive gallery: approving a face-mismatch means "this really
    // is them at a new angle". Fold the captured face into the subject's gallery
    // so the next punch at that angle matches on its own. Capped so an employee's
    // gallery can't grow without bound.
    if (
      dto.action === 'APPROVE' &&
      review.issueType === 'FACE_MISMATCH' &&
      review.employeeId &&
      review.probeEmbedding &&
      review.probeEmbedding.length > 0
    ) {
      await this.addApprovedFaceToGallery(
        clientId,
        review.employeeId,
        review.probeEmbedding,
      );
    }

    await this.reviewRepo.update(
      { reviewId },
      {
        status: newStatus,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        adminRemarks: dto.remarks ?? null,
      },
    );
    await this.audit(
      clientId,
      actorId,
      `REVIEW_${dto.action}`,
      'REVIEW_QUEUE',
      reviewId,
      {
        issueType: review.issueType,
        reassignEmployeeId: dto.reassignEmployeeId,
      },
    );
    return { ok: true, status: newStatus };
  }

  // ── Short-day reviews ─────────────────────────────────────────────────────
  /**
   * Employee-days that worked fewer than the full-day hours and have no branch
   * decision yet. Branch users see only their own branches. Worked time =
   * sum of IN→OUT intervals over the IST business day.
   */
  listShortDayReviews(
    clientId: string,
    opts: { from?: string; to?: string; branchIds?: string[] | null } = {},
  ) {
    if (opts.branchIds?.length === 0) return Promise.resolve([]);
    const from =
      opts.from ?? new Date(Date.now() - 45 * 86_400_000).toISOString();
    const to = opts.to ?? new Date().toISOString();
    const params: unknown[] = [clientId, from, to];
    let branchFilter = '';
    if (opts.branchIds && opts.branchIds.length > 0) {
      params.push(opts.branchIds);
      branchFilter = `AND a.branch_id = ANY($${params.length}::uuid[])`;
    }
    params.push(FULL_DAY_MINUTES * 60);
    const thr = params.length;
    return this.attRepo.manager.query(
      `WITH punches AS (
         SELECT a.employee_id, a.branch_id, a.punch_time, a.punch_type,
                (a.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS biz_day,
                LEAD(a.punch_time) OVER w AS next_time,
                LEAD(a.punch_type) OVER w AS next_type
           FROM facedesk_attendance_logs a
          WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time < $3
            AND a.attendance_status IN ('MARKED','APPROVED') ${branchFilter}
         WINDOW w AS (
           PARTITION BY a.employee_id, (a.punch_time AT TIME ZONE 'Asia/Kolkata')::date
           ORDER BY a.punch_time
         )
       ), days AS (
         SELECT p.employee_id, p.branch_id, p.biz_day,
                count(*)::int AS punches,
                min(p.punch_time) AS first_in, max(p.punch_time) AS last_out,
                COALESCE(SUM(CASE WHEN p.punch_type = 'IN' AND p.next_type = 'OUT'
                      THEN EXTRACT(EPOCH FROM (p.next_time - p.punch_time)) END), 0)::int
                  AS worked_seconds,
                string_agg(
                  to_char(p.punch_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || ' ' || p.punch_type,
                  ', ' ORDER BY p.punch_time
                ) AS punch_list
           FROM punches p
          GROUP BY p.employee_id, p.branch_id, p.biz_day
       )
       SELECT d.employee_id AS "employeeId", e.employee_code AS "employeeCode",
              e.name AS "employeeName", d.branch_id AS "branchId",
              b.branch_name AS "branchName", to_char(d.biz_day, 'YYYY-MM-DD') AS "day",
              d.punches AS "punches", d.punch_list AS "punchList",
              d.worked_seconds AS "workedSeconds",
              d.first_in AS "firstIn", d.last_out AS "lastOut"
         FROM days d
         JOIN employees e ON e.id = d.employee_id
         LEFT JOIN branches b ON b.id = d.branch_id
         LEFT JOIN facedesk_day_reviews dr
           ON dr.client_id = $1 AND dr.employee_id = d.employee_id AND dr.work_date = d.biz_day
        WHERE d.worked_seconds < $${thr} AND dr.id IS NULL
        ORDER BY d.biz_day DESC, e.employee_code ASC LIMIT 500`,
      params,
    );
  }

  /**
   * Branch decision on a short day. APPROVE → counts as a full day, REJECT → 0.
   * Upserts one row per (client, employee, work_date). Worked minutes are
   * recomputed here from the punches so the stored figure can't be spoofed.
   */
  async actOnDayReview(
    clientId: string,
    actorId: string,
    dto: DayReviewActionDto,
    allowedBranchIds: string[] | null = null,
  ) {
    const [agg] = await this.attRepo.manager.query<
      Array<{
        workedSeconds: number;
        branchId: string | null;
        punches: number;
        firstIn: Date | null;
        lastOut: Date | null;
        employeeCode: string | null;
      }>
    >(
      `WITH punches AS (
         SELECT a.punch_time, a.punch_type, a.branch_id,
                LEAD(a.punch_time) OVER w AS next_time,
                LEAD(a.punch_type) OVER w AS next_type
           FROM facedesk_attendance_logs a
          WHERE a.client_id = $1 AND a.employee_id = $2
            AND (a.punch_time AT TIME ZONE 'Asia/Kolkata')::date = $3::date
            AND a.attendance_status IN ('MARKED','APPROVED')
         WINDOW w AS (ORDER BY a.punch_time)
       )
       SELECT COALESCE(SUM(CASE WHEN punch_type = 'IN' AND next_type = 'OUT'
                    THEN EXTRACT(EPOCH FROM (next_time - punch_time)) END), 0)::int
                AS "workedSeconds",
              (array_agg(branch_id ORDER BY punch_time))[1] AS "branchId",
              count(*)::int AS "punches",
              min(punch_time) AS "firstIn", max(punch_time) AS "lastOut",
              (SELECT employee_code FROM employees WHERE id = $2 AND client_id = $1)
                AS "employeeCode"
         FROM punches`,
      [clientId, dto.employeeId, dto.workDate],
    );
    if (!agg || agg.punches === 0) {
      throw new NotFoundException('No punches for that employee on that day');
    }
    const branchId = agg.branchId ?? null;
    // Branch user may only act on days in their own branch.
    if (
      allowedBranchIds !== null &&
      (branchId === null || !allowedBranchIds.includes(branchId))
    ) {
      throw new NotFoundException('No punches for that employee on that day');
    }
    if (Number(agg.workedSeconds) >= FULL_DAY_MINUTES * 60) {
      throw new BadRequestException(
        'That day already meets full-day hours — no review needed',
      );
    }
    const decision =
      dto.action === 'FULL_DAY'
        ? 'APPROVED'
        : dto.action === 'HALF_DAY'
          ? 'HALF_DAY'
          : 'REJECTED';
    const workedMinutes = Math.round(Number(agg.workedSeconds) / 60);
    await this.attRepo.manager.query(
      `INSERT INTO facedesk_day_reviews
         (client_id, employee_id, branch_id, work_date, worked_minutes,
          decision, reviewed_by, reviewed_at, remarks)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, now(), $8)
       ON CONFLICT (client_id, employee_id, work_date)
         DO UPDATE SET decision = EXCLUDED.decision,
                       worked_minutes = EXCLUDED.worked_minutes,
                       branch_id = EXCLUDED.branch_id,
                       reviewed_by = EXCLUDED.reviewed_by,
                       reviewed_at = now(),
                       remarks = EXCLUDED.remarks`,
      [
        clientId,
        dto.employeeId,
        branchId,
        dto.workDate,
        workedMinutes,
        decision,
        actorId,
        dto.remarks ?? null,
      ],
    );
    // Push the decision into the payroll source of truth (attendance_records)
    // so REJECT actually makes the day absent and FULL_DAY/HALF_DAY set the
    // paid day unit — not just the FaceDesk report.
    await this.applyDayDecisionToAttendance(clientId, actorId, dto, {
      workedMinutes,
      branchId,
      firstIn: agg.firstIn,
      lastOut: agg.lastOut,
      employeeCode: agg.employeeCode,
    });
    await this.audit(
      clientId,
      actorId,
      `DAY_REVIEW_${dto.action}`,
      'DAY_REVIEW',
      `${dto.employeeId}:${dto.workDate}`,
      { workedMinutes, branchId },
    );
    return { ok: true, decision };
  }

  /**
   * Write a short-day decision onto the shared attendance_records row (the
   * payroll source): FULL_DAY → PRESENT/APPROVED, HALF_DAY → HALF_DAY/APPROVED,
   * REJECT → ABSENT/REJECTED. source is set to MANUAL so a later biometric
   * re-ingest preserves the branch decision instead of resetting it to PRESENT
   * (see BiometricService rollup's manual-override guard). Upserts on
   * (employee_id, date) so it works whether the punches were already rolled up
   * or not.
   */
  private async applyDayDecisionToAttendance(
    clientId: string,
    actorId: string,
    dto: DayReviewActionDto,
    ctx: {
      workedMinutes: number;
      branchId: string | null;
      firstIn: Date | null;
      lastOut: Date | null;
      employeeCode: string | null;
    },
  ): Promise<void> {
    const status =
      dto.action === 'FULL_DAY'
        ? 'PRESENT'
        : dto.action === 'HALF_DAY'
          ? 'HALF_DAY'
          : 'ABSENT';
    const approvalStatus = dto.action === 'REJECT' ? 'REJECTED' : 'APPROVED';
    const rejectionReason = dto.action === 'REJECT' ? (dto.remarks ?? null) : null;
    const shortWorkReason = dto.action === 'REJECT' ? null : (dto.remarks ?? null);
    const workedHours = (ctx.workedMinutes / 60).toFixed(2);

    const updated: Array<{ id: string }> = await this.attRepo.manager.query(
      `UPDATE attendance_records
          SET status = $4, approval_status = $5, approved_by_user_id = $6,
              approved_at = now(), rejection_reason = $7, short_work_reason = $8,
              worked_hours = $9, source = 'MANUAL', updated_at = now(),
              check_in = COALESCE(($10::timestamptz AT TIME ZONE 'Asia/Kolkata')::time, check_in),
              check_out = COALESCE(($11::timestamptz AT TIME ZONE 'Asia/Kolkata')::time, check_out)
        WHERE client_id = $1 AND employee_id = $2 AND date = $3::date
      RETURNING id`,
      [
        clientId,
        dto.employeeId,
        dto.workDate,
        status,
        approvalStatus,
        actorId,
        rejectionReason,
        shortWorkReason,
        workedHours,
        ctx.firstIn,
        ctx.lastOut,
      ],
    );
    if (updated.length > 0) return;

    // No attendance row yet (punches never rolled up, e.g. offline) — create it.
    await this.attRepo.manager.query(
      `INSERT INTO attendance_records
         (client_id, branch_id, employee_id, employee_code, date, status,
          check_in, check_out, worked_hours, overtime_hours, source,
          capture_method, approval_status, approved_by_user_id, approved_at,
          rejection_reason, short_work_reason)
       VALUES ($1, $2, $3, $4, $5::date, $6,
               ($7::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,
               ($8::timestamptz AT TIME ZONE 'Asia/Kolkata')::time,
               $9, 0, 'MANUAL', 'FACE', $10, $11, now(), $12, $13)
       ON CONFLICT (employee_id, date) DO NOTHING`,
      [
        clientId,
        ctx.branchId,
        dto.employeeId,
        ctx.employeeCode ?? '',
        dto.workDate,
        status,
        ctx.firstIn,
        ctx.lastOut,
        workedHours,
        approvalStatus,
        actorId,
        rejectionReason,
        shortWorkReason,
      ],
    );
  }

  /**
   * Add an HR-approved face to the subject's gallery so a later punch at that
   * angle matches on its own. Tagged EXPRESSION and capped to the newest 15 so
   * the gallery stays healthy without unbounded growth. The core enrollment
   * angles (FRONT/LEFT/RIGHT) are never touched.
   */
  private async addApprovedFaceToGallery(
    clientId: string,
    subjectId: string,
    embedding: Buffer,
  ): Promise<void> {
    const profile = await this.profileRepo.findOne({
      where: { employeeId: subjectId, clientId },
    });
    if (!profile) return;
    await this.sampleRepo.save({
      employeeId: subjectId,
      profileId: profile.profileId,
      sampleType: 'EXPRESSION',
      embedding,
      embeddingModel: profile.embeddingModel,
    });
    const expr = await this.sampleRepo.find({
      where: { profileId: profile.profileId, sampleType: 'EXPRESSION' },
      order: { createdAt: 'DESC' },
      select: ['sampleId'],
    });
    if (expr.length > 15) {
      await this.sampleRepo.delete(expr.slice(15).map((s) => s.sampleId));
    }
  }

  // ── Manual corrections ────────────────────────────────────────────────────
  async createCorrection(
    clientId: string,
    branchId: string | null,
    actorId: string,
    dto: ManualCorrectionDto,
  ) {
    if (!dto.employeeId)
      throw new BadRequestException('employeeId is required');
    const row = await this.correctionRepo.save({
      clientId,
      branchId,
      employeeId: dto.employeeId,
      attendanceId: dto.attendanceId ?? null,
      correctionType: dto.correctionType,
      newPunchTime: dto.newPunchTime ? new Date(dto.newPunchTime) : null,
      newPunchType: dto.newPunchType ?? null,
      reason: dto.reason ?? null,
      requestedBy: actorId,
      status: 'PENDING',
    });
    await this.reviewRepo.save({
      clientId,
      branchId,
      employeeId: dto.employeeId,
      attendanceId: dto.attendanceId ?? null,
      issueType: 'MANUAL_CORRECTION',
      status: 'PENDING',
    });
    await this.audit(
      clientId,
      actorId,
      'CORRECTION_REQUEST',
      'CORRECTION',
      row.correctionId,
      {
        correctionType: dto.correctionType,
      },
    );
    return { ok: true, correctionId: row.correctionId };
  }

  async approveCorrection(
    clientId: string,
    correctionId: string,
    actorId: string,
    approve: boolean,
  ) {
    const c = await this.correctionRepo.findOne({
      where: { correctionId, clientId },
    });
    if (!c) throw new NotFoundException('Correction not found');
    if (c.status !== 'PENDING')
      throw new BadRequestException(`Already ${c.status}`);

    if (approve) {
      if (c.correctionType === 'DELETE' && c.attendanceId) {
        await this.attRepo.update(
          { attendanceId: c.attendanceId },
          { attendanceStatus: 'REJECTED' },
        );
      } else if (c.correctionType === 'EDIT' && c.attendanceId) {
        await this.attRepo.update(
          { attendanceId: c.attendanceId },
          {
            punchTime: c.newPunchTime ?? undefined,
            punchType: (c.newPunchType as 'IN' | 'OUT') ?? undefined,
            attendanceStatus: 'APPROVED',
          },
        );
      } else if (c.correctionType === 'ADD' && c.newPunchTime) {
        await this.attRepo.save({
          employeeId: c.employeeId,
          clientId,
          branchId: c.branchId,
          punchType: (c.newPunchType as 'IN' | 'OUT') ?? 'AUTO',
          punchTime: c.newPunchTime,
          attendanceStatus: 'APPROVED',
          syncStatus: 'SYNCED',
        });
      }
    }
    await this.correctionRepo.update(
      { correctionId },
      {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedBy: actorId,
        resolvedAt: new Date(),
      },
    );
    await this.audit(
      clientId,
      actorId,
      approve ? 'CORRECTION_APPROVE' : 'CORRECTION_REJECT',
      'CORRECTION',
      correctionId,
      {},
    );
    return { ok: true, status: approve ? 'APPROVED' : 'REJECTED' };
  }
}
