import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { BiometricService } from '../biometric/biometric.service';
import { ContractorEmployeeEntity } from '../contractor/contractor-employees/entities/contractor-employee.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractorFaceEnrollmentEntity } from './entities/contractor-face-enrollment.entity';
import { FaceEnrollmentEntity } from './entities/face-enrollment.entity';
import { FaceEmbeddingClient } from './face-embedding.client';
import { FacePhotoStorage } from './face-photo-storage.service';
import {
  MobileAttendanceDeviceEntity,
  MobileDeviceMode,
} from './entities/mobile-attendance-device.entity';
import {
  EnrollContractorFaceDto,
  EnrollFaceDto,
  EnrollSelfDto,
  MobilePunchDto,
  RegisterMobileDeviceDto,
} from './mobile-attendance.dto';

// Mapped (cos+1)/2 threshold. Bumped 0.70 → 0.78 (raw cos 0.56) in Phase 3a
// to tighten the false-accept band; spec asks 0.90 but that's too strict
// without server-side face alignment, so we step up to 0.78 first and will
// raise again once we add alignment.
const MIN_MATCH_SCORE = 0.78;
const MIN_LIVENESS_SCORE = 0.5;
// Phase 3d: active liveness challenge. When the deployment env opts in
// (FACE_LIVENESS_CHALLENGE_REQUIRED=true), every punch must carry a
// challenge that was satisfied on-device within this window.
const LIVENESS_CHALLENGE_REQUIRED =
  String(process.env.FACE_LIVENESS_CHALLENGE_REQUIRED || '').toLowerCase() ===
  'true';
const LIVENESS_CHALLENGE_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes
// Phase 3a: server-time clock-skew gate. A live punch's `punchTime` must
// fall inside this window relative to server time. Punches outside the
// window are rejected unless `body.offlineSync === true`, which is set by
// the Android queue worker when draining offline rows.
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;        // 5 min ahead
const MAX_OFFLINE_BACKLOG_MS = 24 * 60 * 60 * 1000; // 24h behind for live; queue worker can override
// Duplicate-face guard at enrollment: if any *other* employee in the same
// client has a stored embedding whose mapped similarity to the new one is
// >= this value, reject as a duplicate. 0.82 mapped == raw cos 0.64, well
// inside the same-person band but above the typical inter-class noise
// floor (0.5–0.65 mapped). Looser than the per-punch match threshold on
// purpose because enrollment is one-shot.
const DUPLICATE_FACE_THRESHOLD = 0.82;
// After an OUT (logout) punch, the same employee cannot record any further
// punch (IN or OUT) until this cooldown elapses. This enforces a minimum
// 8-hour gap between a shift end and the next shift start, even if the
// next shift crosses midnight.
const POST_LOGOUT_COOLDOWN_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class MobileAttendanceService {
  private readonly logger = new Logger(MobileAttendanceService.name);

  constructor(
    @InjectRepository(FaceEnrollmentEntity)
    private readonly faceRepo: Repository<FaceEnrollmentEntity>,
    @InjectRepository(ContractorFaceEnrollmentEntity)
    private readonly contractorFaceRepo: Repository<ContractorFaceEnrollmentEntity>,
    @InjectRepository(MobileAttendanceDeviceEntity)
    private readonly deviceRepo: Repository<MobileAttendanceDeviceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(ContractorEmployeeEntity)
    private readonly contractorEmpRepo: Repository<ContractorEmployeeEntity>,
    private readonly biometricService: BiometricService,
    private readonly faceEmbeddingClient: FaceEmbeddingClient,
    private readonly notifications: NotificationsService,
    private readonly facePhotos: FacePhotoStorage,
  ) {}

  // ---------------------------------------------------------------- devices
  async registerDevice(
    clientId: string,
    registeredBy: string | null,
    body: RegisterMobileDeviceDto,
  ): Promise<MobileAttendanceDeviceEntity> {
    if (body.mode === 'ESS' && !body.essEmployeeId) {
      throw new BadRequestException(
        'essEmployeeId is required when mode is ESS',
      );
    }
    if (body.mode === 'ESS') {
      if (body.geofenceLat == null || body.geofenceLng == null) {
        throw new BadRequestException(
          'Geofence latitude and longitude are required for ESS devices',
        );
      }
      if (!body.geofenceRadiusM || body.geofenceRadiusM <= 0) {
        throw new BadRequestException(
          'Geofence radius (metres) is required for ESS devices',
        );
      }
    }
    if (body.essEmployeeId) {
      const emp = await this.empRepo.findOne({
        where: { id: body.essEmployeeId, clientId },
      });
      if (!emp) throw new NotFoundException('ESS employee not found');

      // One employee code = one active ESS device. Block re-registration on a
      // second phone until the previous one is revoked, otherwise the same
      // employee can punch from multiple devices simultaneously.
      const existing = await this.deviceRepo.findOne({
        where: {
          clientId,
          essEmployeeId: body.essEmployeeId,
          isActive: true,
        },
      });
      if (existing) {
        throw new ConflictException(
          `Employee ${emp.employeeCode ?? emp.id} is already bound to an active device` +
            (existing.deviceLabel ? ` ("${existing.deviceLabel}")` : '') +
            `. Revoke the previous device before registering a new one.`,
        );
      }
    }
    const installToken = randomBytes(32).toString('hex');
    const dev = this.deviceRepo.create({
      clientId,
      branchId: body.branchId ?? null,
      mode: body.mode,
      deviceLabel: body.deviceLabel ?? null,
      installToken,
      geofenceLat: body.geofenceLat ?? null,
      geofenceLng: body.geofenceLng ?? null,
      geofenceRadiusM: body.geofenceRadiusM ?? null,
      essEmployeeId: body.essEmployeeId ?? null,
      registeredBy,
      isActive: true,
    });
    return this.deviceRepo.save(dev);
  }

  async listDevices(clientId: string): Promise<MobileAttendanceDeviceEntity[]> {
    return this.deviceRepo.find({
      where: { clientId },
      order: { registeredAt: 'DESC' },
    });
  }

  async revokeDevice(
    clientId: string,
    deviceId: string,
    revokedBy: string | null,
  ) {
    const dev = await this.deviceRepo.findOne({
      where: { id: deviceId, clientId },
    });
    if (!dev) throw new NotFoundException('Device not found');
    dev.isActive = false;
    dev.revokedAt = new Date();
    dev.revokedBy = revokedBy;
    return this.deviceRepo.save(dev);
  }

  /**
   * Permanently delete a previously-revoked device row. Only allowed once
   * the device is already revoked (isActive === false) so an active kiosk
   * is never accidentally wiped. Past punches are unaffected (they store
   * the device id as a plain string, not a FK).
   */
  async hardDeleteDevice(clientId: string, deviceId: string) {
    const dev = await this.deviceRepo.findOne({
      where: { id: deviceId, clientId },
    });
    if (!dev) throw new NotFoundException('Device not found');
    if (dev.isActive) {
      throw new BadRequestException(
        'Revoke the device before deleting it permanently',
      );
    }
    await this.deviceRepo.delete({ id: deviceId, clientId });
    return { ok: true, id: deviceId };
  }

  /** Resolve install-token -> device. Throws on revoked / unknown. */
  async resolveDeviceByToken(
    token: string,
  ): Promise<MobileAttendanceDeviceEntity> {
    if (!token) throw new UnauthorizedException('Missing device token');
    const dev = await this.deviceRepo.findOne({
      where: { installToken: token },
    });
    if (!dev || !dev.isActive)
      throw new UnauthorizedException('Invalid device token');
    dev.lastSeenAt = new Date();
    await this.deviceRepo.update(dev.id, { lastSeenAt: dev.lastSeenAt });
    return dev;
  }

  // -------------------------------------------------------------- enrollment
  async enrollFace(
    clientId: string,
    enrolledBy: string | null,
    body: EnrollFaceDto,
    allowedBranchIds: string[] | null = null,
  ): Promise<FaceEnrollmentEntity> {
    if (!body.consentGiven) {
      throw new BadRequestException(
        'Employee consent is required for biometric enrollment',
      );
    }
    if (!body.embeddingBase64 && !body.photoBase64) {
      throw new BadRequestException(
        'Provide either embeddingBase64 or photoBase64',
      );
    }
    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (allowedBranchIds && !allowedBranchIds.includes(emp.branchId ?? '')) {
      throw new ForbiddenException(
        'Employee is not in your branch scope',
      );
    }

    // Resolve embedding. Three sources, in priority order:
    //   1. caller supplied embeddingBase64 (mobile self-enroll forwarded by admin)
    //   2. caller supplied photoBase64  → call face-svc to compute embedding
    //   3. neither → already rejected above
    let embedding: Buffer | null = body.embeddingBase64
      ? Buffer.from(body.embeddingBase64, 'base64')
      : null;
    let embeddingModel: string | null = body.embeddingModel ?? null;
    let faceScore: number | null = null;

    if (!embedding && body.photoBase64) {
      if (!this.faceEmbeddingClient.isEnabled()) {
        throw new BadRequestException(
          'Server-side face embedding is not configured (FACE_SVC_URL unset)',
        );
      }
      const result = await this.faceEmbeddingClient.embedPhoto(body.photoBase64);
      if (!result) {
        throw new BadRequestException('Face embedding service unavailable');
      }
      embedding = Buffer.from(result.embeddingBase64, 'base64');
      embeddingModel = embeddingModel || result.embeddingModel;
      faceScore = result.faceScore;
      this.logger.log(
        `enrollFace photo→embed ok employee=${emp.id} score=${faceScore.toFixed(3)} bytes=${embedding.length}`,
      );
    }

    // Phase 3c: persist the enrollment selfie when FACE_PHOTO_AUDIT is on.
    // When disabled (default) we never write the photo, only the embedding.
    const photoUrl = await this.facePhotos.put({
      clientId,
      employeeCode: emp.employeeCode,
      purpose: 'enroll',
      timestamp: new Date(),
      photoB64: body.photoBase64,
    });

    // Duplicate-face guard: a face that already belongs to a *different*
    // employee in this client must not be re-enrolled (prevents one person
    // registering under multiple employee codes).
    if (embedding) {
      await this.assertFaceNotDuplicate(clientId, emp.id, embedding);
    }

    const existing = await this.faceRepo.findOne({
      where: { employeeId: emp.id },
    });
    const now = new Date();
    const payload: Partial<FaceEnrollmentEntity> = {
      employeeId: emp.id,
      clientId,
      branchId: emp.branchId ?? null,
      embedding,
      embeddingModel: embeddingModel ?? 'mobilefacenet-v1',
      photoUrl,
      consentGivenAt: now,
      consentGivenBy: enrolledBy,
      enrolledAt: now,
      enrolledBy,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
    };
    if (existing) {
      await this.faceRepo.update({ employeeId: emp.id }, payload);
      await this.logEnrollmentHistory({
        employeeId: emp.id,
        clientId,
        action: 'RE_ENROLL',
        embeddingModel: payload.embeddingModel ?? null,
        actorUserId: enrolledBy ?? null,
      });
      return (await this.faceRepo.findOne({ where: { employeeId: emp.id } }))!;
    }
    const created = await this.faceRepo.save(this.faceRepo.create(payload));
    await this.logEnrollmentHistory({
      employeeId: emp.id,
      clientId,
      action: 'ENROLL',
      embeddingModel: payload.embeddingModel ?? null,
      actorUserId: enrolledBy ?? null,
    });
    return created;
  }

  /**
   * ESS self-enrollment from the bound personal phone. The X-Device-Token
   * already authenticated the device; we trust the device.essEmployeeId
   * binding established at registration time and store the embedding
   * computed on-device.
   */
  async enrollSelf(
    device: MobileAttendanceDeviceEntity,
    body: EnrollSelfDto,
  ): Promise<{ ok: true; employeeId: string }> {
    if (device.mode !== 'ESS') {
      throw new ForbiddenException('Self-enroll is only available in ESS mode');
    }
    if (!device.essEmployeeId) {
      throw new BadRequestException(
        'Device is not bound to an employee; re-register the device',
      );
    }
    if (!body.consentGiven) {
      throw new BadRequestException(
        'Employee consent is required for biometric enrollment',
      );
    }
    const emp = await this.empRepo.findOne({
      where: { id: device.essEmployeeId, clientId: device.clientId },
    });
    if (!emp) throw new NotFoundException('Bound employee not found');

    const embedding = Buffer.from(body.embeddingBase64, 'base64');

    // Duplicate-face guard: a face already enrolled for a different employee
    // in this client must not be re-enrolled under another employee code.
    await this.assertFaceNotDuplicate(device.clientId, emp.id, embedding);

    const photoUrl = await this.facePhotos.put({
      clientId: device.clientId,
      employeeCode: emp.employeeCode,
      purpose: 'enroll',
      timestamp: new Date(),
      photoB64: body.photoBase64,
    });

    const now = new Date();
    const payload: Partial<FaceEnrollmentEntity> = {
      employeeId: emp.id,
      clientId: device.clientId,
      branchId: emp.branchId ?? device.branchId ?? null,
      embedding,
      embeddingModel: body.embeddingModel ?? 'mobilefacenet-v1',
      photoUrl,
      consentGivenAt: now,
      consentGivenBy: emp.id,
      enrolledAt: now,
      enrolledBy: emp.id,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
    };
    const existing = await this.faceRepo.findOne({
      where: { employeeId: emp.id },
    });
    if (existing) {
      await this.faceRepo.update({ employeeId: emp.id }, payload);
    } else {
      await this.faceRepo.save(this.faceRepo.create(payload));
    }
    await this.logEnrollmentHistory({
      employeeId: emp.id,
      clientId: device.clientId,
      action: existing ? 'RE_ENROLL' : 'ENROLL',
      embeddingModel: payload.embeddingModel ?? null,
      actorUserId: emp.id,
    });
    return { ok: true, employeeId: emp.id };
  }

  async deactivateEnrollment(
    clientId: string,
    employeeId: string,
    by: string | null,
    reason: string,
    allowedBranchIds: string[] | null = null,
  ) {
    const row = await this.faceRepo.findOne({
      where: { employeeId, clientId },
    });
    if (!row) throw new NotFoundException('Enrollment not found');
    if (allowedBranchIds && !allowedBranchIds.includes(row.branchId ?? '')) {
      throw new ForbiddenException(
        'Employee is not in your branch scope',
      );
    }
    row.isActive = false;
    row.deactivatedAt = new Date();
    row.deactivationReason = reason;
    void by;
    const saved = await this.faceRepo.save(row);
    await this.logEnrollmentHistory({
      employeeId,
      clientId,
      action: 'DEACTIVATE',
      reason,
      embeddingModel: row.embeddingModel ?? null,
      actorUserId: by ?? null,
    });
    return saved;
  }

  // ---------------------------- re-enrollment approval workflow (Phase 3e)

  /**
   * Stash a pending re-enrollment request. The new embedding lives in
   * face_reenrollment_requests until a reviewer approves it; the live
   * face_enrollments row is untouched. If an active enrollment doesn't
   * exist for this employee, falls through to direct enrollment instead
   * (no-one is being overwritten).
   */
  async createReenrollRequest(
    clientId: string,
    requestedBy: string | null,
    body: import('./mobile-attendance.dto').CreateReenrollRequestDto,
    allowedBranchIds: string[] | null = null,
  ): Promise<{
    ok: true;
    pending: boolean;
    requestId?: string;
  }> {
    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (allowedBranchIds && !allowedBranchIds.includes(emp.branchId ?? '')) {
      throw new ForbiddenException('Employee is not in your branch scope');
    }
    const embedding = Buffer.from(body.embeddingBase64, 'base64');

    const existing = await this.faceRepo.findOne({
      where: { employeeId: emp.id, isActive: true },
    });
    if (!existing) {
      // No active enrollment to overwrite — nothing to approve, just log.
      this.logger.log(
        `createReenrollRequest: no active enrollment for ${emp.employeeCode}, deferring to admin enroll flow`,
      );
      return { ok: true, pending: false };
    }

    // Block obvious duplicates: same face already on file for *another*
    // employee in this client. Approval can't repair this — admin must
    // resolve the duplicate first.
    await this.assertFaceNotDuplicate(clientId, emp.id, embedding);

    const photoUrl = await this.facePhotos.put({
      clientId,
      employeeCode: emp.employeeCode,
      purpose: 'enroll',
      timestamp: new Date(),
      photoB64: body.photoBase64,
    });

    const rows: Array<{ id: string }> = await this.faceRepo.manager.query(
      `INSERT INTO face_reenrollment_requests
         (client_id, employee_id, branch_id, requested_by, reason,
          embedding, embedding_model, photo_url, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        clientId,
        emp.id,
        emp.branchId ?? null,
        requestedBy,
        body.reason ?? null,
        embedding,
        body.embeddingModel ?? 'mobilefacenet-v1',
        photoUrl,
        body.source ?? 'ADMIN',
      ],
    );
    const requestId = rows?.[0]?.id;
    return { ok: true, pending: true, requestId };
  }

  async listReenrollRequests(
    clientId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' = 'PENDING',
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
      id: string;
      employeeId: string;
      employeeCode: string | null;
      employeeName: string | null;
      branchId: string | null;
      requestedBy: string | null;
      requestedAt: string;
      reason: string | null;
      photoUrl: string | null;
      source: string;
      status: string;
      reviewedBy: string | null;
      reviewedAt: string | null;
      reviewNotes: string | null;
    }>
  > {
    const params: any[] = [clientId, status];
    let branchSql = '';
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      branchSql = `AND (r.branch_id = ANY($3::uuid[]))`;
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      // Branch-scoped user with no branches → see nothing.
      return [];
    }
    return this.faceRepo.manager.query(
      `SELECT r.id, r.employee_id AS "employeeId",
              e.employee_code AS "employeeCode", e.name AS "employeeName",
              r.branch_id AS "branchId",
              r.requested_by AS "requestedBy",
              r.requested_at AS "requestedAt",
              r.reason, r.photo_url AS "photoUrl", r.source, r.status,
              r.reviewed_by AS "reviewedBy",
              r.reviewed_at AS "reviewedAt",
              r.review_notes AS "reviewNotes"
         FROM face_reenrollment_requests r
         LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.client_id = $1
          AND r.status = $2
          ${branchSql}
        ORDER BY r.requested_at DESC
        LIMIT 500`,
      params,
    );
  }

  async reviewReenrollRequest(
    clientId: string,
    requestId: string,
    reviewerUserId: string | null,
    body: import('./mobile-attendance.dto').ReviewReenrollRequestDto,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    const rows: Array<{
      id: string;
      client_id: string;
      employee_id: string;
      branch_id: string | null;
      embedding: Buffer;
      embedding_model: string | null;
      photo_url: string | null;
      status: string;
    }> = await this.faceRepo.manager.query(
      `SELECT id, client_id, employee_id, branch_id,
              embedding, embedding_model, photo_url, status
         FROM face_reenrollment_requests
        WHERE id = $1 AND client_id = $2
        LIMIT 1`,
      [requestId, clientId],
    );
    const req = rows?.[0];
    if (!req) throw new NotFoundException('Re-enrollment request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `Request already ${req.status.toLowerCase()}`,
      );
    }
    if (
      allowedBranchIds &&
      !allowedBranchIds.includes(req.branch_id ?? '')
    ) {
      throw new ForbiddenException('Request is not in your branch scope');
    }

    if (body.decision === 'REJECTED') {
      await this.faceRepo.manager.query(
        `UPDATE face_reenrollment_requests
            SET status = 'REJECTED',
                reviewed_by = $1,
                reviewed_at = now(),
                review_notes = $2
          WHERE id = $3`,
        [reviewerUserId, body.notes ?? null, req.id],
      );
      return { ok: true, status: 'REJECTED' };
    }

    // APPROVED: copy the new embedding into face_enrollments, append a
    // RE_ENROLL row to history, then mark the request approved. Done in
    // a single transaction so a partial failure doesn't leave a stale
    // PENDING row pointing at an already-applied embedding.
    await this.faceRepo.manager.transaction(async (tx) => {
      await tx.query(
        `UPDATE face_enrollments
            SET embedding = $1,
                embedding_model = COALESCE($2, embedding_model),
                photo_url = COALESCE($3, photo_url),
                is_active = true,
                deactivated_at = NULL,
                deactivation_reason = NULL,
                updated_at = now()
          WHERE employee_id = $4 AND client_id = $5`,
        [
          req.embedding,
          req.embedding_model,
          req.photo_url,
          req.employee_id,
          req.client_id,
        ],
      );
      await tx.query(
        `INSERT INTO face_enrollment_history
           (employee_id, client_id, action, reason, embedding_model, actor_user_id)
         VALUES ($1, $2, 'RE_ENROLL', $3, $4, $5)`,
        [
          req.employee_id,
          req.client_id,
          body.notes ?? 'Approved re-enrollment request',
          req.embedding_model,
          reviewerUserId,
        ],
      );
      await tx.query(
        `UPDATE face_reenrollment_requests
            SET status = 'APPROVED',
                reviewed_by = $1,
                reviewed_at = now(),
                review_notes = $2
          WHERE id = $3`,
        [reviewerUserId, body.notes ?? null, req.id],
      );
    });
    return { ok: true, status: 'APPROVED' };
  }

  /**
   * List every active employee with their face-enrollment status so admins
   * (and branch desks) can see at a glance who is enrolled vs pending.
   * BRANCH_DESK callers pass `allowedBranchIds` to scope the result.
   */
  async listEnrollmentStatus(
    clientId: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
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
    }>
  > {
    const qb = this.empRepo
      .createQueryBuilder('e')
      .leftJoin(
        'face_enrollments',
        'fe',
        'fe.employee_id = e.id AND fe.client_id = e.client_id',
      )
      .select([
        'e.id              AS "employeeId"',
        'e.employee_code   AS "employeeCode"',
        'e.name            AS "employeeName"',
        'e.branch_id       AS "branchId"',
        'fe.is_active      AS "feActive"',
        'fe.embedding_model AS "embeddingModel"',
        'fe.enrolled_at    AS "enrolledAt"',
        'fe.deactivated_at AS "deactivatedAt"',
        'fe.deactivation_reason AS "deactivationReason"',
      ])
      .where('e.client_id = :clientId', { clientId })
      .andWhere('e.is_active = true');

    if (allowedBranchIds) {
      if (allowedBranchIds.length === 0) return [];
      qb.andWhere('e.branch_id IN (:...branchIds)', {
        branchIds: allowedBranchIds,
      });
    }
    qb.orderBy('e.name', 'ASC');

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeCode: r.employeeCode,
      employeeName: r.employeeName,
      branchId: r.branchId,
      isEnrolled: r.enrolledAt != null,
      isActive: r.feActive === true || r.feActive === 't',
      embeddingModel: r.embeddingModel,
      enrolledAt: r.enrolledAt ? new Date(r.enrolledAt).toISOString() : null,
      deactivatedAt: r.deactivatedAt
        ? new Date(r.deactivatedAt).toISOString()
        : null,
      deactivationReason: r.deactivationReason,
    }));
  }

  /**
   * Roster for mobile devices to pull at startup. Returns:
   *   - device metadata (id, mode, branchId, geofence, essEmployeeId)
   *   - enrolled employees (with embeddings) so matching can run on-device
   *
   * For ESS-mode devices the enrollments list is filtered to the bound
   * employee only (1:1 verify); for KIOSK it's the full branch/client roster.
   */
  async roster(device: MobileAttendanceDeviceEntity) {
    const where: Record<string, unknown> = {
      clientId: device.clientId,
      isActive: true,
    };
    if (device.mode === 'ESS' && device.essEmployeeId) {
      where.employeeId = device.essEmployeeId;
    } else if (device.branchId) {
      where.branchId = device.branchId;
    }
    const rows = await this.faceRepo.find({ where: where as any });

    let enrollments: Array<{
      employeeId: string;
      employeeCode: string;
      displayName: string;
      embeddingB64: string;
    }> = [];
    if (rows.length) {
      const empIds = rows.map((r) => r.employeeId);
      const emps = await this.empRepo.findByIds(empIds);
      const byId = new Map(emps.map((e) => [e.id, e]));
      enrollments = rows
        .filter((r) => r.embedding)
        .map((r) => {
          const e = byId.get(r.employeeId);
          return {
            employeeId: r.employeeId,
            employeeCode: e?.employeeCode ?? '',
            displayName: e?.name ?? '',
            embeddingB64: r.embedding!.toString('base64'),
          };
        });
    }

    // Brand/branch labels for the kiosk header strip. Single round-trip; we
    // don't import the Branch/Client entities here to avoid pulling in their
    // modules just for two string columns.
    let branchName: string | null = null;
    let clientName: string | null = null;
    try {
      const rows = await this.faceRepo.manager.query(
        `SELECT c.client_name AS "clientName", b.branchname AS "branchName"
         FROM clients c
         LEFT JOIN client_branches b ON b.id = $2
         WHERE c.id = $1
         LIMIT 1`,
        [device.clientId, device.branchId ?? null],
      );
      if (rows && rows[0]) {
        clientName = rows[0].clientName ?? null;
        branchName = rows[0].branchName ?? null;
      }
    } catch {
      // best-effort — kiosk header will fall back to brand-only.
    }

    return {
      deviceId: device.id,
      mode: device.mode,
      clientId: device.clientId,
      clientName,
      branchId: device.branchId,
      branchName,
      geofenceLat: device.geofenceLat,
      geofenceLng: device.geofenceLng,
      geofenceRadiusM: device.geofenceRadiusM,
      essEmployeeId: device.essEmployeeId,
      enrollments,
    };
  }

  /**
   * Reject an enrollment if its embedding is too similar to one already on
   * file for a *different* employee in the same client. Threshold:
   * DUPLICATE_FACE_THRESHOLD (mapped (cos+1)/2). Throws ConflictException
   * naming the existing employee so the admin can investigate.
   */
  private async assertFaceNotDuplicate(
    clientId: string,
    employeeId: string,
    embeddingBuf: Buffer,
  ): Promise<void> {
    const probe = decodeEmbedding(embeddingBuf);
    if (!probe) return; // can't validate malformed buffers; let DB write fail later
    const rows = await this.faceRepo.find({
      where: { clientId, isActive: true },
    });
    let bestEmpId: string | null = null;
    let bestScore = -Infinity;
    for (const r of rows) {
      if (r.employeeId === employeeId) continue; // updating own enrollment is fine
      const cand = decodeEmbedding(r.embedding);
      if (!cand || cand.length !== probe.length) continue;
      const s = toMatchScore(cosineSim(probe, cand));
      if (s > bestScore) {
        bestScore = s;
        bestEmpId = r.employeeId;
      }
    }
    if (bestEmpId && bestScore >= DUPLICATE_FACE_THRESHOLD) {
      const dup = await this.empRepo.findOne({ where: { id: bestEmpId } });
      const label = dup
        ? `${dup.employeeCode ?? dup.id} (${dup.name ?? 'unknown'})`
        : bestEmpId;
      await this.logDuplicateAttempt({
        clientId,
        attemptingEmployeeId: employeeId,
        matchedEmployeeId: bestEmpId,
        score: bestScore,
        source: 'enroll',
      });
      throw new ConflictException(
        `This face already appears to be enrolled for employee ${label} ` +
          `(similarity ${bestScore.toFixed(2)}). Each face may only be ` +
          `registered to one employee. Deactivate the other enrollment first ` +
          `if this is genuinely the same person.`,
      );
    }
  }

  // ------------------------------------------------------------------ punch
  // Public entry: wraps the validation+insert flow and writes a row to
  // face_failed_scan_logs for every rejection so admins have a single
  // searchable log of bad attempts. Successful punches don't write here
  // (biometric_punches is the system of record).
  async recordPunch(
    device: MobileAttendanceDeviceEntity,
    body: MobilePunchDto,
    actorEmployeeId?: string | null,
  ) {
    try {
      return await this._recordPunchInner(device, body, actorEmployeeId);
    } catch (e: any) {
      const reason = classifyRejection(e);
      await this.logFailedScan({
        clientId: device.clientId,
        branchId: device.branchId ?? null,
        deviceId: device.id,
        employeeCode: body.employeeCode ?? null,
        employeeId: body.employeeId ?? null,
        reason,
        reasonDetail: typeof e?.message === 'string' ? e.message : String(e),
        matchScore: body.matchScore ?? null,
        livenessScore: body.livenessScore ?? null,
        captureLat: body.captureLat ?? null,
        captureLng: body.captureLng ?? null,
      });
      // Repeated-failure alert (best-effort).
      if (body.employeeCode) {
        this.maybeAlertRepeatedFailures(
          device.clientId,
          body.employeeCode,
          reason,
        ).catch((err) =>
          this.logger.warn(`alert hook failed: ${err?.message ?? err}`),
        );
      }
      throw e;
    }
  }

  private async _recordPunchInner(
    device: MobileAttendanceDeviceEntity,
    body: MobilePunchDto,
    actorEmployeeId?: string | null,
  ) {
    // ESS mode: punch must be for the bound employee. Prefer the device
    // binding (it's authoritative) over the supplied employeeId.
    const expectedEmpId =
      device.mode === 'ESS' ? device.essEmployeeId ?? actorEmployeeId : null;
    if (
      device.mode === 'ESS' &&
      expectedEmpId &&
      expectedEmpId !== body.employeeId
    ) {
      throw new ForbiddenException(
        'ESS punch must be for the device-bound employee',
      );
    }

    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId: device.clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Employee-status gate: inactive, resigned, or already-exited employees
    // cannot punch. exitDate is a yyyy-mm-dd string in IST; if today >= exit
    // we treat them as separated.
    if (!emp.isActive) {
      throw new ForbiddenException(
        `Employee ${emp.employeeCode ?? emp.id} is inactive — attendance not allowed`,
      );
    }
    if (emp.dateOfExit) {
      const today = new Date().toISOString().slice(0, 10);
      if (emp.dateOfExit <= today) {
        throw new ForbiddenException(
          `Employee ${emp.employeeCode ?? emp.id} exited on ${emp.dateOfExit} — attendance not allowed`,
        );
      }
    }

    // Phase 3a: integrity gates BEFORE any quality gate so spoofed punches
    // are surfaced with the most actionable reason.
    if (body.isMockLocation === true) {
      throw new ForbiddenException(
        'Mock location detected — attendance blocked. Disable fake-GPS apps and try again.',
      );
    }
    if (body.isRooted === true) {
      this.logger.warn(
        `recordPunch rooted-device employee=${emp.employeeCode ?? emp.id} client=${device.clientId} device=${device.id}`,
      );
      // Soft-block: log but allow (some legitimate factory tablets are rooted).
      // Flip to ForbiddenException after the rooted-device review is signed off.
    }

    // Quality gates — reject low confidence / liveness
    if (body.matchScore != null && body.matchScore < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `Face match score ${body.matchScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
      );
    }
    if (body.livenessScore != null && body.livenessScore < MIN_LIVENESS_SCORE) {
      throw new BadRequestException('Liveness check failed');
    }

    // Phase 3d: active liveness challenge. When required by env, the punch
    // must carry a recently-satisfied challenge token (BLINK / HEAD_TURN /
    // SMILE). Empty or stale tokens are rejected; the failure is logged
    // under the LIVENESS_FAIL bucket via classifyRejection.
    if (LIVENESS_CHALLENGE_REQUIRED) {
      if (!body.livenessChallengeType || !body.livenessChallengePassedAt) {
        throw new BadRequestException(
          'Active liveness challenge required (perform the on-screen action and try again)',
        );
      }
      const passedAt = Date.parse(body.livenessChallengePassedAt);
      if (Number.isNaN(passedAt)) {
        throw new BadRequestException('Invalid liveness challenge timestamp');
      }
      const ageMs = Date.now() - passedAt;
      if (ageMs < -LIVENESS_CHALLENGE_MAX_AGE_MS) {
        throw new BadRequestException(
          'Liveness challenge timestamp is in the future — check device clock',
        );
      }
      if (ageMs > LIVENESS_CHALLENGE_MAX_AGE_MS) {
        throw new BadRequestException(
          'Liveness challenge expired — please retake the action',
        );
      }
    }

    // Geofence check (kiosk: device location is fixed, not enforced here)
    if (
      device.mode === 'ESS' &&
      device.geofenceLat != null &&
      device.geofenceLng != null &&
      device.geofenceRadiusM != null &&
      body.captureLat != null &&
      body.captureLng != null
    ) {
      const dist = haversineMeters(
        Number(device.geofenceLat),
        Number(device.geofenceLng),
        body.captureLat,
        body.captureLng,
      );
      if (dist > device.geofenceRadiusM) {
        throw new ForbiddenException(
          `Outside allowed geofence (~${Math.round(dist)}m from site)`,
        );
      }
    }

    const ts = new Date(body.punchTime);
    if (isNaN(ts.getTime()))
      throw new BadRequestException('Invalid punchTime');

    // Phase 3a: server-time clock-skew gate. Live punches must be within a
    // tight window of server time. Offline-queue drains (offlineSync=true)
    // bypass the backlog cap because legitimate offline rows can be days
    // old; we still reject anything in the future to prevent replay attacks.
    const nowMs = Date.now();
    const tsMs = ts.getTime();
    if (tsMs - nowMs > MAX_FUTURE_SKEW_MS) {
      throw new BadRequestException(
        'Device clock is ahead of the server — please re-sync time and try again.',
      );
    }
    if (!body.offlineSync && nowMs - tsMs > MAX_OFFLINE_BACKLOG_MS) {
      throw new BadRequestException(
        'Punch timestamp is older than 24 hours — submit via the offline-sync queue.',
      );
    }

    // Post-logout cooldown: if the most recent punch for this employee was
    // an OUT and less than 8h have elapsed, reject. Prevents marking another
    // login (or another logout) within the rest window — even across
    // midnight. Direction 'AUTO' is treated like OUT only when the prior
    // punch in the same session was an IN, but to keep the rule simple and
    // strict we honour an explicit OUT in the most recent row.
    const lastPunchRows: Array<{ punch_time: Date; direction: string }> =
      await this.faceRepo.manager.query(
        `SELECT punch_time, direction
           FROM biometric_punches
          WHERE client_id = $1
            AND employee_code = $2
            AND punch_time <= $3
          ORDER BY punch_time DESC
          LIMIT 1`,
        [device.clientId, emp.employeeCode, ts],
      );
    if (lastPunchRows.length) {
      const last = lastPunchRows[0];
      const lastMs = new Date(last.punch_time).getTime();
      const elapsed = ts.getTime() - lastMs;
      if (last.direction === 'OUT' && elapsed >= 0 && elapsed < POST_LOGOUT_COOLDOWN_MS) {
        const remainMs = POST_LOGOUT_COOLDOWN_MS - elapsed;
        const h = Math.floor(remainMs / (60 * 60 * 1000));
        const m = Math.ceil((remainMs - h * 60 * 60 * 1000) / 60000);
        throw new ForbiddenException(
          `Logout already recorded. Next punch allowed after the 8h rest window — please wait ${h}h ${m}m.`,
        );
      }
    }

    const source: 'MOBILE_KIOSK' | 'MOBILE_ESS' =
      device.mode === 'KIOSK' ? 'MOBILE_KIOSK' : 'MOBILE_ESS';

    // Cross-source mutual exclusion: an employee may use either the company
    // kiosk OR their personal ESS app on a given business day, never both.
    // If any mobile punch already exists for this employee on the same IST
    // business date with the *other* source, reject this punch. Punches from
    // physical biometric devices (eSSL, etc.) are not constrained.
    const otherSource =
      source === 'MOBILE_KIOSK' ? 'MOBILE_ESS' : 'MOBILE_KIOSK';
    const conflict: Array<{ src: string }> = await this.faceRepo.manager.query(
      `SELECT source AS src
         FROM biometric_punches
        WHERE client_id = $1
          AND employee_code = $2
          AND source = $3
          AND (punch_time AT TIME ZONE 'Asia/Kolkata')::date
              = (($4)::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
        LIMIT 1`,
      [device.clientId, emp.employeeCode, otherSource, ts.toISOString()],
    );
    if (conflict.length) {
      const usedLabel = otherSource === 'MOBILE_KIOSK' ? 'Kiosk' : 'ESS';
      const tryingLabel = source === 'MOBILE_KIOSK' ? 'Kiosk' : 'ESS';
      throw new ForbiddenException(
        `Attendance for today already marked via ${usedLabel}. ${tryingLabel} punches are not allowed on the same day. Continue using the ${usedLabel} app for the rest of the day.`,
      );
    }

    // Use existing biometric ingest for idempotency + roll-up. Then patch
    // the just-inserted row with mobile-specific evidence columns.
    const ingestResult = await this.biometricService.ingest(
      device.clientId,
      [
        {
          employeeCode: emp.employeeCode,
          punchTime: ts.toISOString(),
          direction: body.direction ?? 'AUTO',
          deviceId: `mobile:${device.id}`,
          branchId: emp.branchId ?? device.branchId ?? undefined,
        } as any,
      ],
      true,
    );

    // Phase 3c: persist the selfie when FACE_PHOTO_AUDIT is enabled. Returns
    // null when disabled — column stays untouched via COALESCE.
    const photoUrl = await this.facePhotos.put({
      clientId: device.clientId,
      employeeCode: emp.employeeCode,
      purpose: 'punch',
      timestamp: ts,
      photoB64: body.photoB64,
    });

    // Patch evidence columns (raw SQL — short and avoids fetching the row twice)
    await this.faceRepo.manager.query(
      `UPDATE biometric_punches
         SET mobile_device_id = $1,
             capture_lat = $2,
             capture_lng = $3,
             capture_accuracy_m = $4,
             photo_url = COALESCE($5, photo_url),
             match_score = $6,
             liveness_score = $7,
             match_provider = $8,
             source = $9
       WHERE client_id = $10
         AND employee_code = $11
         AND punch_time = $12
         AND device_id = $13`,
      [
        device.id,
        body.captureLat ?? null,
        body.captureLng ?? null,
        body.captureAccuracyM ?? null,
        photoUrl,
        body.matchScore ?? null,
        body.livenessScore ?? null,
        body.matchProvider ?? 'mobilefacenet',
        source,
        device.clientId,
        emp.employeeCode,
        ts,
        `mobile:${device.id}`,
      ],
    );

    await this.deviceRepo.update(device.id, { lastPunchAt: ts });

    return {
      ok: true,
      duplicate: ingestResult.inserted === 0 && ingestResult.duplicates > 0,
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      punchTime: ts.toISOString(),
      mode: device.mode,
    };
  }

  // ----------------------------------------------------------- audit logs

  /** Append a row to face_failed_scan_logs. Best-effort: never throws. */
  private async logFailedScan(input: {
    clientId: string;
    branchId: string | null;
    deviceId: string | null;
    employeeId: string | null;
    employeeCode: string | null;
    reason: string;
    reasonDetail: string | null;
    matchScore: number | null;
    livenessScore: number | null;
    captureLat: number | null;
    captureLng: number | null;
  }): Promise<void> {
    try {
      await this.faceRepo.manager.query(
        `INSERT INTO face_failed_scan_logs
           (client_id, branch_id, device_id, employee_id, employee_code,
            reason, reason_detail, match_score, liveness_score,
            capture_lat, capture_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          input.clientId,
          input.branchId,
          input.deviceId,
          input.employeeId,
          input.employeeCode,
          input.reason,
          input.reasonDetail,
          input.matchScore,
          input.livenessScore,
          input.captureLat,
          input.captureLng,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`logFailedScan failed: ${e?.message ?? e}`);
    }
  }

  /** Append a row to face_duplicate_attempt_logs. Best-effort: never throws. */
  private async logDuplicateAttempt(input: {
    clientId: string;
    attemptingEmployeeId: string | null;
    matchedEmployeeId: string;
    score: number;
    source: string;
    actorUserId?: string | null;
  }): Promise<void> {
    try {
      await this.faceRepo.manager.query(
        `INSERT INTO face_duplicate_attempt_logs
           (client_id, attempting_employee_id, matched_employee_id,
            match_score, attempted_by_user_id, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.clientId,
          input.attemptingEmployeeId,
          input.matchedEmployeeId,
          input.score,
          input.actorUserId ?? null,
          input.source,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`logDuplicateAttempt failed: ${e?.message ?? e}`);
    }
  }

  /** Append a row to face_enrollment_history. Best-effort: never throws. */
  private async logEnrollmentHistory(input: {
    employeeId: string;
    clientId: string;
    action: 'ENROLL' | 'RE_ENROLL' | 'DEACTIVATE' | 'REACTIVATE';
    reason?: string | null;
    embeddingModel?: string | null;
    actorUserId?: string | null;
  }): Promise<void> {
    try {
      await this.faceRepo.manager.query(
        `INSERT INTO face_enrollment_history
           (employee_id, client_id, action, reason, embedding_model, actor_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.employeeId,
          input.clientId,
          input.action,
          input.reason ?? null,
          input.embeddingModel ?? null,
          input.actorUserId ?? null,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`logEnrollmentHistory failed: ${e?.message ?? e}`);
    }
  }

  // ============================================================ contractors
  // Phase 4a: face enrollment lifecycle for contractor employees. Targets
  // contractor_employees.id (separate table from the in-house workforce)
  // and writes to the parallel contractor_face_enrollments table. Punch
  // path for contractors is NOT yet wired — this only covers enrollment,
  // listing, and deactivation from the admin/branch desk.

  async enrollContractorFace(
    clientId: string,
    enrolledBy: string | null,
    body: EnrollContractorFaceDto,
    allowedBranchIds: string[] | null = null,
  ): Promise<ContractorFaceEnrollmentEntity> {
    if (!body.consentGiven) {
      throw new BadRequestException(
        'Contractor employee consent is required for biometric enrollment',
      );
    }
    if (!body.embeddingBase64 && !body.photoBase64) {
      throw new BadRequestException(
        'Provide either embeddingBase64 or photoBase64',
      );
    }
    const ce = await this.contractorEmpRepo.findOne({
      where: { id: body.contractorEmployeeId, clientId },
    });
    if (!ce) throw new NotFoundException('Contractor employee not found');
    if (allowedBranchIds && !allowedBranchIds.includes(ce.branchId ?? '')) {
      throw new ForbiddenException(
        'Contractor employee is not in your branch scope',
      );
    }
    if (!ce.isActive) {
      throw new BadRequestException(
        'Contractor employee is inactive; reactivate before enrolling a face',
      );
    }

    let embedding: Buffer | null = body.embeddingBase64
      ? Buffer.from(body.embeddingBase64, 'base64')
      : null;
    let embeddingModel: string | null = body.embeddingModel ?? null;

    if (!embedding && body.photoBase64) {
      if (!this.faceEmbeddingClient.isEnabled()) {
        throw new BadRequestException(
          'Server-side face embedding is not configured (FACE_SVC_URL unset)',
        );
      }
      const result = await this.faceEmbeddingClient.embedPhoto(body.photoBase64);
      if (!result) {
        throw new BadRequestException('Face embedding service unavailable');
      }
      embedding = Buffer.from(result.embeddingBase64, 'base64');
      embeddingModel = embeddingModel || result.embeddingModel;
      this.logger.log(
        `enrollContractorFace photo→embed ok contractorEmp=${ce.id} bytes=${embedding.length}`,
      );
    }

    const photoUrl = await this.facePhotos.put({
      clientId,
      // Contractor employees have no employee_code; use the UUID for the
      // storage key so audit blobs are still uniquely addressable.
      employeeCode: `contractor-${ce.id}`,
      purpose: 'enroll',
      timestamp: new Date(),
      photoB64: body.photoBase64,
    });

    const existing = await this.contractorFaceRepo.findOne({
      where: { contractorEmployeeId: ce.id },
    });
    const now = new Date();
    const payload: Partial<ContractorFaceEnrollmentEntity> = {
      contractorEmployeeId: ce.id,
      clientId,
      branchId: ce.branchId ?? null,
      contractorUserId: ce.contractorUserId ?? null,
      embedding,
      embeddingModel: embeddingModel ?? 'mobilefacenet-v1',
      photoUrl,
      consentGivenAt: now,
      consentGivenBy: enrolledBy,
      enrolledAt: now,
      enrolledBy,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
    };
    if (existing) {
      await this.contractorFaceRepo.update(
        { contractorEmployeeId: ce.id },
        payload,
      );
      await this.logContractorEnrollmentHistory({
        contractorEmployeeId: ce.id,
        clientId,
        action: 'RE_ENROLL',
        embeddingModel: payload.embeddingModel ?? null,
        actorUserId: enrolledBy ?? null,
      });
      return (await this.contractorFaceRepo.findOne({
        where: { contractorEmployeeId: ce.id },
      }))!;
    }
    const created = await this.contractorFaceRepo.save(
      this.contractorFaceRepo.create(payload),
    );
    await this.logContractorEnrollmentHistory({
      contractorEmployeeId: ce.id,
      clientId,
      action: 'ENROLL',
      embeddingModel: payload.embeddingModel ?? null,
      actorUserId: enrolledBy ?? null,
    });
    return created;
  }

  async deactivateContractorEnrollment(
    clientId: string,
    contractorEmployeeId: string,
    by: string | null,
    reason: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<ContractorFaceEnrollmentEntity> {
    const row = await this.contractorFaceRepo.findOne({
      where: { contractorEmployeeId, clientId },
    });
    if (!row) throw new NotFoundException('Contractor enrollment not found');
    if (allowedBranchIds && !allowedBranchIds.includes(row.branchId ?? '')) {
      throw new ForbiddenException(
        'Contractor employee is not in your branch scope',
      );
    }
    row.isActive = false;
    row.deactivatedAt = new Date();
    row.deactivationReason = reason;
    const saved = await this.contractorFaceRepo.save(row);
    await this.logContractorEnrollmentHistory({
      contractorEmployeeId,
      clientId,
      action: 'DEACTIVATE',
      reason,
      embeddingModel: row.embeddingModel ?? null,
      actorUserId: by ?? null,
    });
    return saved;
  }

  /**
   * List every active contractor employee with their face-enrollment status
   * so admins (and branch desks) can see at a glance who is enrolled vs
   * pending. BRANCH_DESK callers pass `allowedBranchIds` to scope.
   */
  async listContractorEnrollmentStatus(
    clientId: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
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
    }>
  > {
    const qb = this.contractorEmpRepo
      .createQueryBuilder('ce')
      .leftJoin(
        'contractor_face_enrollments',
        'cfe',
        'cfe.contractor_employee_id = ce.id AND cfe.client_id = ce.client_id',
      )
      .select([
        'ce.id                AS "contractorEmployeeId"',
        'ce.name              AS "name"',
        'ce.branch_id         AS "branchId"',
        'ce.contractor_user_id AS "contractorUserId"',
        'cfe.is_active        AS "feActive"',
        'cfe.embedding_model  AS "embeddingModel"',
        'cfe.enrolled_at      AS "enrolledAt"',
        'cfe.deactivated_at   AS "deactivatedAt"',
        'cfe.deactivation_reason AS "deactivationReason"',
      ])
      .where('ce.client_id = :clientId', { clientId })
      .andWhere('ce.is_active = true');

    if (allowedBranchIds) {
      if (allowedBranchIds.length === 0) return [];
      qb.andWhere('ce.branch_id IN (:...branchIds)', {
        branchIds: allowedBranchIds,
      });
    }
    qb.orderBy('ce.name', 'ASC');

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      contractorEmployeeId: r.contractorEmployeeId,
      name: r.name,
      branchId: r.branchId,
      contractorUserId: r.contractorUserId,
      isEnrolled: r.enrolledAt != null,
      isActive: r.feActive === true || r.feActive === 't',
      embeddingModel: r.embeddingModel,
      enrolledAt: r.enrolledAt ? new Date(r.enrolledAt).toISOString() : null,
      deactivatedAt: r.deactivatedAt
        ? new Date(r.deactivatedAt).toISOString()
        : null,
      deactivationReason: r.deactivationReason,
    }));
  }

  /** Append a row to contractor_face_enrollment_history. Best-effort. */
  private async logContractorEnrollmentHistory(input: {
    contractorEmployeeId: string;
    clientId: string;
    action: 'ENROLL' | 'RE_ENROLL' | 'DEACTIVATE' | 'REACTIVATE';
    reason?: string | null;
    embeddingModel?: string | null;
    actorUserId?: string | null;
  }): Promise<void> {
    try {
      await this.contractorFaceRepo.manager.query(
        `INSERT INTO contractor_face_enrollment_history
           (contractor_employee_id, client_id, action, reason,
            embedding_model, actor_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.contractorEmployeeId,
          input.clientId,
          input.action,
          input.reason ?? null,
          input.embeddingModel ?? null,
          input.actorUserId ?? null,
        ],
      );
    } catch (e: any) {
      this.logger.warn(
        `logContractorEnrollmentHistory failed: ${e?.message ?? e}`,
      );
    }
  }

  /**
   * If an employee has accumulated >=3 failed scans of the same reason in
   * the last 10 minutes, raise a system notification (deduplicated per
   * employee + reason + IST date so admins don't get spammed).
   */
  private async maybeAlertRepeatedFailures(
    clientId: string,
    employeeCode: string,
    reason: string,
  ): Promise<void> {
    const rows: Array<{ n: string }> = await this.faceRepo.manager.query(
      `SELECT COUNT(*)::text AS n
         FROM face_failed_scan_logs
        WHERE client_id = $1
          AND employee_code = $2
          AND reason = $3
          AND attempted_at >= now() - interval '10 minutes'`,
      [clientId, employeeCode, reason],
    );
    const n = Number(rows?.[0]?.n ?? 0);
    if (n < 3) return;
    const today = new Date().toISOString().slice(0, 10);
    await this.notifications.createSystemNotification({
      clientId,
      sourceKey: `face-mismatch:${employeeCode}:${reason}:${today}`,
      subject: `Repeated face-attendance failures: ${employeeCode}`,
      message:
        `Employee ${employeeCode} has triggered ${n} ${reason} rejections ` +
        `in the last 10 minutes today (${today}). Please verify identity ` +
        `and review enrollment.`,
      queryType: 'ATTENDANCE',
      priority: 1,
    });
  }
}

/**
 * Map a thrown exception (or its message) onto the closed reason taxonomy
 * used by face_failed_scan_logs.reason. Falls back to 'OTHER' so we never
 * lose a row.
 */
function classifyRejection(e: any): string {
  const msg = (typeof e?.message === 'string' ? e.message : '').toLowerCase();
  if (!msg) return 'OTHER';
  if (msg.includes('mock location')) return 'MOCK_LOCATION';
  if (msg.includes('match score') || msg.includes('did not match'))
    return 'FACE_MISMATCH';
  if (msg.includes('liveness')) return 'LIVENESS_FAIL';
  if (msg.includes('multiple face')) return 'MULTI_FACE';
  if (msg.includes('mask')) return 'MASK_DETECTED';
  if (msg.includes('outside') && msg.includes('geofence'))
    return 'GEOFENCE_OUTSIDE';
  if (msg.includes('rooted')) return 'ROOTED_DEVICE';
  if (msg.includes('inactive')) return 'EMPLOYEE_INACTIVE';
  if (msg.includes('exited')) return 'EMPLOYEE_EXITED';
  if (msg.includes('rest window') || msg.includes('logout already recorded'))
    return 'COOLDOWN_ACTIVE';
  if (msg.includes('already marked via') || msg.includes('cross'))
    return 'CROSS_SOURCE_CONFLICT';
  if (msg.includes('clock') || msg.includes('older than 24 hours'))
    return 'CLOCK_SKEW';
  if (msg.includes('invalid punchtime')) return 'INVALID_TIME';
  if (msg.includes('quality') || msg.includes('below threshold'))
    return 'QUALITY_LOW';
  if (msg.includes('device-bound') || msg.includes('not found'))
    return 'OTHER';
  return 'OTHER';
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Decode a stored embedding (Buffer of little-endian float32, length must
 * be a multiple of 4) into a Float32-equivalent number array. Returns null
 * if the buffer is empty or malformed.
 */
function decodeEmbedding(buf: Buffer | null | undefined): Float32Array | null {
  if (!buf || buf.length === 0 || buf.length % 4 !== 0) return null;
  // Buffer is a Uint8Array view over the underlying ArrayBuffer; create a
  // matching Float32Array view at the same offset.
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

/** Cosine similarity for two L2-normalised vectors of equal length. */
function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Map raw cosine [-1,1] to [0,1] (matches Android FaceEmbedder.toMatchScore). */
function toMatchScore(cos: number): number {
  return (cos + 1) / 2;
}
