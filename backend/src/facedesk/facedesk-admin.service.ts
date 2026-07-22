import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FaceDeskAttendanceEntity,
  FaceDeskAuditEntity,
  FaceDeskCorrectionEntity,
  FaceDeskDuplicateAlertEntity,
  FaceDeskProfileEntity,
  FaceDeskReviewQueueEntity,
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
    @InjectRepository(FaceDeskProfileEntity)
    private readonly profileRepo: Repository<FaceDeskProfileEntity>,
    @InjectRepository(FaceDeskCorrectionEntity)
    private readonly correctionRepo: Repository<FaceDeskCorrectionEntity>,
    @InjectRepository(FaceDeskAuditEntity)
    private readonly auditRepo: Repository<FaceDeskAuditEntity>,
  ) {}

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
    return this.dupeRepo.find({
      where: {
        clientId,
        status: status as FaceDeskDuplicateAlertEntity['status'],
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
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
              e.name AS "employeeName", e.employee_code AS "employeeCode",
              rq.attendance_id AS "attendanceId", a.photo_url AS "photoUrl",
              a.punch_time AS "punchTime", a.punch_type AS "punchType",
              rq.branch_id AS "branchId", rq.issue_type AS "issueType",
              rq.confidence_score AS "confidenceScore", rq.status AS "status",
              rq.admin_remarks AS "adminRemarks", rq.created_at AS "createdAt"
         FROM facedesk_attendance_review_queue rq
         LEFT JOIN employees e ON e.id = rq.employee_id
         LEFT JOIN facedesk_attendance_logs a ON a.attendance_id = rq.attendance_id
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
