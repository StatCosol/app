import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
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
  DuplicateActionDto,
  ManualCorrectionDto,
  ReviewActionDto,
} from './facedesk.dto';

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
  ) {}

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
    if (
      branchIds &&
      branchIds.length > 0 &&
      row.branchId &&
      !branchIds.includes(row.branchId)
    ) {
      throw new NotFoundException('Review item not found');
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
  listDuplicateAlerts(clientId: string, status = 'PENDING') {
    return this.dupeRepo.manager.query(
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
              COALESCE(me.branch_id, mc.branch_id, mp.branch_id) AS "matchedBranchId"
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
        WHERE da.client_id = $1 AND da.status = $2
        ORDER BY da.created_at DESC
        LIMIT 200`,
      [clientId, status],
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
    // Approving or clearing the alert unblocks the new employee's enrollment
    // (they still must re-enroll to store a template).
    if (dto.action !== 'REJECT') {
      await this.profileRepo.update(
        { employeeId: alert.newEmployeeId, clientId },
        { duplicateStatus: 'APPROVED', enrollmentStatus: 'PENDING' },
      );
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
