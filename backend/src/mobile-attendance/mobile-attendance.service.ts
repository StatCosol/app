import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { BiometricService } from '../biometric/biometric.service';
import { ContractorEmployeeEntity } from '../contractor/contractor-employees/entities/contractor-employee.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractorBiometricPunchEntity } from './entities/contractor-biometric-punch.entity';
import { ContractorFaceEnrollmentEntity } from './entities/contractor-face-enrollment.entity';
import { AttendanceShiftEntity } from './entities/attendance-shift.entity';
import { FaceEnrollmentEntity } from './entities/face-enrollment.entity';
import { FaceLivenessNonceEntity } from './entities/face-liveness-nonce.entity';
import type { PadProvider } from './pad/pad-provider';
import { PAD_PROVIDER } from './pad/pad-provider';
import { getShiftMode, validateAgainstShift } from './shift/shift-validator';
import { FaceEmbeddingClient } from './face-embedding.client';
import { FacePhotoStorage } from './face-photo-storage.service';
import {
  MobileAttendanceDeviceEntity,
  MobileDeviceMode,
} from './entities/mobile-attendance-device.entity';
import {
  ContractorMobilePunchDto,
  EnrollContractorFaceDto,
  EnrollFaceDto,
  EnrollSelfDto,
  MobilePunchDto,
  RegisterMobileDeviceDto,
} from './mobile-attendance.dto';

// Mapped (cos+1)/2 threshold. Bumped 0.70 → 0.78 (Phase 3a) → 0.85 after
// field reports of cross-identity false accepts on the kiosk (a different
// person scanning was being marked present against an enrolled face).
// 0.85 == raw cos 0.70, still below the 0.90 spec ceiling but well above
// the MobileFaceNet inter-class noise band. The on-device matcher now
// also enforces an ambiguity margin (best - 2nd >= 0.04) for 1:N kiosk
// matching; this server-side gate is the second line of defence on the
// per-punch payload.
const MIN_MATCH_SCORE = 0.85;
const MIN_LIVENESS_SCORE = 0.5;
// Face-quality gate at enrollment time (roadmap #2). face-svc returns a
// 0..1 confidence/quality score per embedded photo; rejecting low-quality
// enrollments here prevents bad reference embeddings from cascading into
// repeated MATCH_FAIL rejections at punch time. Tunable via env so ops can
// loosen it if a site has poor lighting before the camera is replaced.
const MIN_FACE_QUALITY_SCORE = (() => {
  const raw = process.env.FACE_MIN_QUALITY_SCORE;
  if (raw == null || raw === '') return 0.5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
})();
// Phase 3d: active liveness challenge. When the deployment env opts in
// (FACE_LIVENESS_CHALLENGE_REQUIRED=true), every punch must carry a
// challenge that was satisfied on-device within this window.
const LIVENESS_CHALLENGE_REQUIRED =
  String(process.env.FACE_LIVENESS_CHALLENGE_REQUIRED || '').toLowerCase() ===
  'true';
const LIVENESS_CHALLENGE_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes
// Phase 4c: server-issued nonce flow. The set of challenges the server
// may issue — the device must perform exactly the type returned and
// echo back the nonce on the next punch. Adding to this list also
// requires updating the Android client.
const LIVENESS_CHALLENGE_TYPES = [
  'BLINK',
  'HEAD_TURN_LEFT',
  'HEAD_TURN_RIGHT',
  'SMILE',
] as const;
// Lifetime of an issued nonce. Must be long enough for the user to
// perform the action + capture the punch, short enough to limit replay.
const LIVENESS_NONCE_TTL_MS = LIVENESS_CHALLENGE_MAX_AGE_MS;
// Phase 4c: defence-in-depth gate that forces every punch to carry a
// server-recomputable probe embedding (probeEmbeddingB64). When true a
// tampered APK can no longer post a synthetic matchScore for any
// employeeId because the gate immediately rejects punches without a
// probe. Default ON; ops can flip to false ONLY during an APK rollout
// window where old clients without the probe field are still live.
const PUNCH_REQUIRE_SERVER_PROBE =
  String(
    process.env.FACE_PUNCH_REQUIRE_PROBE ?? 'true',
  ).toLowerCase() !== 'false';
// Phase 4c: photo-retention policy. Punch selfies older than this are
// purged by the daily retention cron; enrollment selfies are kept for a
// longer window because they're the consented reference image. Both are
// tunable via env so deployments with stricter data-residency rules can
// shorten the windows.
const PUNCH_PHOTO_RETENTION_DAYS = (() => {
  const raw = Number(process.env.FACE_PUNCH_PHOTO_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
})();
const ENROLLMENT_PHOTO_RETENTION_DAYS = (() => {
  const raw = Number(process.env.FACE_ENROLL_PHOTO_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 365;
})();
// Phase 3a: server-time clock-skew gate. A live punch's `punchTime` must
// fall inside this window relative to server time. Punches outside the
// window are rejected unless `body.offlineSync === true`, which is set by
// the Android queue worker when draining offline rows.
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 min ahead
const MAX_OFFLINE_BACKLOG_MS = 24 * 60 * 60 * 1000; // 24h behind for live; queue worker can override
// Duplicate-face guard at enrollment: if any *other* employee in the same
// client has a stored embedding whose mapped similarity to the new one is
// >= this value, reject as a duplicate. 0.88 mapped == raw cos ~0.76 —
// a strong same-person signal that comfortably sits above the inter-class
// noise floor we've observed in production (lookalike males of the same
// demographic group were tripping the previous 0.82 mapped / cos ~0.64
// threshold and getting falsely rejected as duplicates). This is still
// looser than the per-punch MIN_MATCH_SCORE (0.85) on purpose — we don't
// want a single bad enrollment frame to wedge a real employee out — but
// tight enough to keep the actual same-face-twice case caught.
const DUPLICATE_FACE_THRESHOLD = Number(
  process.env.FACE_DUPLICATE_THRESHOLD || 0.97,
);
// After an OUT (logout) punch, the same employee cannot record any further
// punch (IN or OUT) until this cooldown elapses. This enforces a minimum
// 8-hour gap between a shift end and the next shift start, even if the
// next shift crosses midnight.
const POST_LOGOUT_COOLDOWN_MS = 8 * 60 * 60 * 1000;

// Phase 4c roadmap #16: real-time alerts. Only these rejection reasons
// are considered "security-relevant" \u2014 benign reasons (cooldown,
// employee inactive, clock skew) would just spam admins. Keep in sync
// with the taxonomy in classifyRejection().
const SUSPICIOUS_REJECTION_REASONS: ReadonlySet<string> = new Set([
  'FACE_MISMATCH',
  'LIVENESS_FAIL',
  'MULTI_FACE',
  'MASK_DETECTED',
  'GEOFENCE_OUTSIDE',
  'MOCK_LOCATION',
  'ROOTED_DEVICE',
  'QUALITY_LOW',
]);
const REJECTION_ALERT_WINDOW_MIN = (() => {
  const raw = Number(process.env.FACE_REJECTION_ALERT_WINDOW_MIN);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
})();
const REJECTION_ALERT_THRESHOLD = (() => {
  const raw = Number(process.env.FACE_REJECTION_ALERT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
})();
const DEVICE_REJECTION_ALERT_THRESHOLD = (() => {
  const raw = Number(process.env.FACE_DEVICE_REJECTION_ALERT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
})();
const DASHBOARD_LATE_CUTOFF_HHMM = (() => {
  const raw = String(process.env.FACE_DASHBOARD_LATE_CUTOFF_HHMM || '').trim();
  return /^\d{1,2}:\d{2}$/.test(raw) ? raw : '10:00';
})();

/**
 * Roadmap #17: per-request audit metadata captured by the controller and
 * threaded through to the DB row so admins can see who/where/from-what
 * client a punch (or rejection) actually came from.
 */
export interface PunchRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class MobileAttendanceService {
  private readonly logger = new Logger(MobileAttendanceService.name);

  constructor(
    @InjectRepository(FaceEnrollmentEntity)
    private readonly faceRepo: Repository<FaceEnrollmentEntity>,
    @InjectRepository(ContractorFaceEnrollmentEntity)
    private readonly contractorFaceRepo: Repository<ContractorFaceEnrollmentEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    @InjectRepository(MobileAttendanceDeviceEntity)
    private readonly deviceRepo: Repository<MobileAttendanceDeviceEntity>,
    @InjectRepository(FaceLivenessNonceEntity)
    private readonly nonceRepo: Repository<FaceLivenessNonceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(ContractorEmployeeEntity)
    private readonly contractorEmpRepo: Repository<ContractorEmployeeEntity>,
    @InjectRepository(AttendanceShiftEntity)
    private readonly attendanceShiftRepo: Repository<AttendanceShiftEntity>,
    private readonly biometricService: BiometricService,
    private readonly faceEmbeddingClient: FaceEmbeddingClient,
    private readonly notifications: NotificationsService,
    private readonly facePhotos: FacePhotoStorage,
    @Inject(PAD_PROVIDER) private readonly padProvider: PadProvider,
    @InjectDataSource() private readonly ds: DataSource,
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

  /**
   * Resolve install-token -> device, enforcing single-device binding.
   *
   * The first time a token is presented with a non-empty [androidId] we
   * claim it on the device row (`android_id`). On every subsequent call:
   *   - if the device row already has an `android_id`, the supplied
   *     `androidId` MUST match exactly — otherwise we throw 401 so the
   *     same install token can't be used to activate a second tablet.
   *   - if no `androidId` header was supplied at all (older app build,
   *     server-side internal call, etc.) we fall back to the previous
   *     behaviour and only require an active row.
   *
   * Throws on revoked / unknown / token-already-bound-to-another-device.
   */
  async resolveDeviceByToken(
    token: string,
    androidId?: string | null,
  ): Promise<MobileAttendanceDeviceEntity> {
    if (!token) throw new UnauthorizedException('Missing device token');
    const supplied = (androidId ?? '').trim();

    // Lock the device row for the read-modify-write of `androidId` to avoid
    // two devices simultaneously binding the same install-token. Without the
    // pessimistic lock, both calls see androidId=null and both succeed.
    return await this.ds.transaction(async (mgr) => {
      const dev = await mgr
        .createQueryBuilder(MobileAttendanceDeviceEntity, 'd')
        .setLock('pessimistic_write')
        .where('d.installToken = :token', { token })
        .getOne();
      if (!dev || !dev.isActive)
        throw new UnauthorizedException('Invalid device token');

      if (supplied) {
        if (!dev.androidId) {
          dev.androidId = supplied;
        } else if (dev.androidId !== supplied) {
          this.logger.warn(
            `device token reuse blocked deviceId=${dev.id} bound=${dev.androidId} attempt=${supplied}`,
          );
          throw new UnauthorizedException(
            'This install code is already activated on another device. Ask your administrator to revoke the existing device before re-using the code.',
          );
        }
      }

      dev.lastSeenAt = new Date();
      await mgr.save(MobileAttendanceDeviceEntity, dev);
      return dev;
    });
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
    // Phase 4c: admin-enrol path must always recompute the embedding from
    // the supplied photo, so a tampered client cannot inject a noise /
    // adversarial embedding under a real employee. Pre-computed
    // `embeddingBase64` is silently ignored here.
    if (!body.photoBase64) {
      throw new BadRequestException(
        'photoBase64 is required for admin enrolment (server recomputes the embedding)',
      );
    }
    const emp = await this.empRepo.findOne({
      where: { id: body.employeeId, clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (allowedBranchIds && !allowedBranchIds.includes(emp.branchId ?? '')) {
      throw new ForbiddenException('Employee is not in your branch scope');
    }

    if (!this.faceEmbeddingClient.isEnabled()) {
      throw new BadRequestException(
        'Server-side face embedding is not configured (FACE_SVC_URL unset)',
      );
    }
    const result = await this.faceEmbeddingClient.embedPhoto(body.photoBase64);
    if (!result) {
      throw new BadRequestException('Face embedding service unavailable');
    }
    const embedding: Buffer = Buffer.from(result.embeddingBase64, 'base64');
    const embeddingModel: string = body.embeddingModel || result.embeddingModel;
    const faceScore: number = result.faceScore;
    if (faceScore < MIN_FACE_QUALITY_SCORE) {
      throw new BadRequestException(
        `Face image quality too low (score ${faceScore.toFixed(2)} < ${MIN_FACE_QUALITY_SCORE}) — ` +
          `retake the photo with better lighting and the face clearly centered`,
      );
    }
    this.logger.log(
      `enrollFace photo→embed ok employee=${emp.id} score=${faceScore.toFixed(3)} bytes=${embedding.length}`,
    );

    // Phase 3c: persist the enrollment selfie when FACE_PHOTO_AUDIT is on.
    // When disabled (default) we never write the photo, only the embedding.
    const photoUrl = await this.facePhotos.put({
      clientId,
      employeeCode: emp.employeeCode,
      purpose: 'enroll',
      timestamp: new Date(),
      photoB64: body.photoBase64,
    });

    // Duplicate-face guard + upsert must run inside one transaction so a
    // concurrent enrollment of the same face for a different employee can't
    // slip between the check and the save. The pessimistic_write lock
    // serialises concurrent enrolls for the same employee row.
    return await this.ds.transaction(async (mgr) => {
      if (embedding) {
        await this.assertFaceNotDuplicate(clientId, emp.id, embedding);
      }
      const existing = await mgr
        .createQueryBuilder(FaceEnrollmentEntity, 'fe')
        .setLock('pessimistic_write')
        .where('fe.employeeId = :eid', { eid: emp.id })
        .getOne();
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
        await mgr.update(
          FaceEnrollmentEntity,
          { employeeId: emp.id },
          payload,
        );
        await this.logEnrollmentHistory({
          employeeId: emp.id,
          clientId,
          action: 'RE_ENROLL',
          embeddingModel: payload.embeddingModel ?? null,
          actorUserId: enrolledBy ?? null,
        });
        return (await mgr.findOne(FaceEnrollmentEntity, {
          where: { employeeId: emp.id },
        }))!;
      }
      const created = await mgr.save(
        FaceEnrollmentEntity,
        mgr.create(FaceEnrollmentEntity, payload),
      );
      await this.logEnrollmentHistory({
        employeeId: emp.id,
        clientId,
        action: 'ENROLL',
        embeddingModel: payload.embeddingModel ?? null,
        actorUserId: enrolledBy ?? null,
      });
      return created;
    });
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

    // Phase 4c: prefer server-side recomputed embedding when the device
    // also uploaded the photo and face-svc is configured. Falls back to
    // the device-computed embedding for ESS clients on older APKs that
    // omit photoBase64. The server recompute path additionally applies
    // the MIN_FACE_QUALITY_SCORE gate so a poor-quality enrolment is
    // rejected before it pollutes future match scores.
    let embedding: Buffer;
    let embeddingModel: string = body.embeddingModel ?? 'mobilefacenet-v1';
    if (body.photoBase64 && this.faceEmbeddingClient.isEnabled()) {
      const result = await this.faceEmbeddingClient.embedPhoto(body.photoBase64);
      if (!result) {
        throw new BadRequestException('Face embedding service unavailable');
      }
      if (result.faceScore < MIN_FACE_QUALITY_SCORE) {
        throw new BadRequestException(
          `Face image quality too low (score ${result.faceScore.toFixed(2)} < ${MIN_FACE_QUALITY_SCORE}) — ` +
            `retake the photo with better lighting and the face clearly centered`,
        );
      }
      embedding = Buffer.from(result.embeddingBase64, 'base64');
      embeddingModel = body.embeddingModel || result.embeddingModel;
    } else {
      embedding = Buffer.from(body.embeddingBase64, 'base64');
    }

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
      embeddingModel,
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
      throw new ForbiddenException('Employee is not in your branch scope');
    }
    row.isActive = false;
    row.deactivatedAt = new Date();
    row.deactivationReason = reason;
    // Phase 4c / DPDP: crypto-shred the embedding bytes so a soft-deleted
    // enrollment cannot be reconstructed even with read-only DB access.
    // The audit log row in face_enrollment_history retains the action and
    // model fields for non-repudiation, but the biometric template itself
    // is gone after this write commits.
    if (row.embedding && row.embedding.length > 0) {
      row.embedding = randomBytes(row.embedding.length);
    }
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

  /**
   * Hard-delete an employee face enrollment row. Use when the row is wrong
   * (e.g. enrolled with the wrong person's photo) and a clean re-enrollment
   * is needed. The `face_enrollment_history` audit log is preserved; we
   * append a final `DELETE` row before removing the live enrollment, and
   * wrap both writes in a single transaction so a partial failure can't
   * leave the audit log inconsistent with the live table.
   */
  async deleteEnrollment(
    clientId: string,
    employeeId: string,
    by: string | null,
    reason: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; deleted: true; employeeId: string }> {
    const row = await this.faceRepo.findOne({
      where: { employeeId, clientId },
    });
    if (!row) throw new NotFoundException('Enrollment not found');
    if (allowedBranchIds && !allowedBranchIds.includes(row.branchId ?? '')) {
      throw new ForbiddenException('Employee is not in your branch scope');
    }
    await this.faceRepo.manager.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO face_enrollment_history
           (employee_id, client_id, action, reason, embedding_model, actor_user_id)
         VALUES ($1, $2, 'DELETE', $3, $4, $5)`,
        [employeeId, clientId, reason, row.embeddingModel ?? null, by ?? null],
      );
      // Phase 4c / DPDP: overwrite embedding bytes before the row delete
      // so the *live* tuple briefly visible inside this tx contains random
      // bytes. Note: Postgres MVCC leaves the original pre-UPDATE tuple
      // version on disk until autovacuum reclaims it, so a recovery from
      // the raw pages could still surface the original embedding. Final
      // shred only completes after autovacuum runs.
      if (row.embedding && row.embedding.length > 0) {
        await tx.update(
          FaceEnrollmentEntity,
          { employeeId, clientId },
          { embedding: randomBytes(row.embedding.length) },
        );
      }
      await tx.delete(FaceEnrollmentEntity, { employeeId, clientId });
    });
    return { ok: true, deleted: true, employeeId };
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
    if (allowedBranchIds && !allowedBranchIds.includes(req.branch_id ?? '')) {
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

    // Phase 4d: KIOSK-mode contractor roster. ESS devices are bound to an
    // in-house employee and never punch contractors, so this stays empty
    // there. Field is additive — old kiosk clients ignore it.
    let contractorEnrollments: Array<{
      contractorEmployeeId: string;
      displayName: string;
      branchId: string | null;
      embeddingB64: string;
      embeddingModel: string | null;
    }> = [];
    if (device.mode === 'KIOSK') {
      const ctrWhere: Record<string, unknown> = {
        clientId: device.clientId,
        isActive: true,
      };
      if (device.branchId) ctrWhere.branchId = device.branchId;
      const ctrRows = await this.contractorFaceRepo.find({
        where: ctrWhere as any,
      });
      if (ctrRows.length) {
        const ctrIds = ctrRows.map((r) => r.contractorEmployeeId);
        const nameRows: Array<{ id: string; name: string }> =
          await this.contractorFaceRepo.manager.query(
            `SELECT id, name FROM contractor_employees WHERE id = ANY($1::uuid[])`,
            [ctrIds],
          );
        const nameById = new Map(nameRows.map((n) => [n.id, n.name]));
        contractorEnrollments = ctrRows
          .filter((r) => r.embedding)
          .map((r) => ({
            contractorEmployeeId: r.contractorEmployeeId,
            displayName: nameById.get(r.contractorEmployeeId) ?? '',
            branchId: r.branchId,
            embeddingB64: r.embedding!.toString('base64'),
            embeddingModel: r.embeddingModel,
          }));
      }
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
      contractorEnrollments,
    };
  }

  /**
   * K9 side-panel dashboard for the kiosk/ESS Android app. Returns a compact
   * "today at a glance" snapshot scoped to the device's client + branch:
   * enrolled headcount, present-today, late arrivals, contractor counts.
   * Late cutoff is FACE_DASHBOARD_LATE_CUTOFF_HHMM (IST, default 10:00).
   * ESS-mode devices only report on their bound employee.
   */
  async kioskDashboard(device: MobileAttendanceDeviceEntity) {
    const branchId = device.branchId ?? null;
    const isEss = device.mode === 'ESS' && !!device.essEmployeeId;

    // Enrolled headcount (in-house).
    const enrolledWhere: Record<string, unknown> = {
      clientId: device.clientId,
      isActive: true,
    };
    if (isEss) enrolledWhere.employeeId = device.essEmployeeId;
    else if (branchId) enrolledWhere.branchId = branchId;
    const enrolledEmployees = await this.faceRepo.count({
      where: enrolledWhere as any,
    });

    // Present + late (in-house). Distinct employee_code with first IN today.
    const empCodeFilter = isEss
      ? `AND employee_code = (SELECT employee_code FROM employees WHERE id = $4 LIMIT 1)`
      : '';
    const empParams: unknown[] = [
      device.clientId,
      branchId,
      DASHBOARD_LATE_CUTOFF_HHMM,
    ];
    if (isEss) empParams.push(device.essEmployeeId);
    const empRows: Array<{ present: string; late: string }> =
      await this.faceRepo.manager.query(
        `WITH first_punch AS (
           SELECT employee_code, MIN(punch_time) AS first_in
             FROM biometric_punches
            WHERE client_id = $1
              AND ($2::uuid IS NULL OR branch_id = $2)
              AND direction IN ('IN','AUTO')
              AND (punch_time AT TIME ZONE 'Asia/Kolkata')::date
                  = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              ${empCodeFilter}
            GROUP BY employee_code
         )
         SELECT COUNT(*)::int AS present,
                COUNT(*) FILTER (
                  WHERE (first_in AT TIME ZONE 'Asia/Kolkata')::time > $3::time
                )::int AS late
           FROM first_punch`,
        empParams,
      );
    const presentToday = Number(empRows?.[0]?.present ?? 0);
    const lateToday = Number(empRows?.[0]?.late ?? 0);

    // Contractor counts — KIOSK-only (ESS devices never see contractors).
    let contractorEnrolled = 0;
    let contractorPresentToday = 0;
    let contractorLateToday = 0;
    if (!isEss) {
      const ctrWhere: Record<string, unknown> = {
        clientId: device.clientId,
        isActive: true,
      };
      if (branchId) ctrWhere.branchId = branchId;
      contractorEnrolled = await this.contractorFaceRepo.count({
        where: ctrWhere as any,
      });
      const ctrRows: Array<{ present: string; late: string }> =
        await this.faceRepo.manager.query(
          `WITH first_punch AS (
             SELECT contractor_employee_id, MIN(punch_time) AS first_in
               FROM contractor_biometric_punches
              WHERE client_id = $1
                AND ($2::uuid IS NULL OR branch_id = $2)
                AND direction IN ('IN','AUTO')
                AND (punch_time AT TIME ZONE 'Asia/Kolkata')::date
                    = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              GROUP BY contractor_employee_id
           )
           SELECT COUNT(*)::int AS present,
                  COUNT(*) FILTER (
                    WHERE (first_in AT TIME ZONE 'Asia/Kolkata')::time > $3::time
                  )::int AS late
             FROM first_punch`,
          [device.clientId, branchId, DASHBOARD_LATE_CUTOFF_HHMM],
        );
      contractorPresentToday = Number(ctrRows?.[0]?.present ?? 0);
      contractorLateToday = Number(ctrRows?.[0]?.late ?? 0);
    }

    return {
      deviceId: device.id,
      mode: device.mode,
      branchId,
      asOf: new Date().toISOString(),
      lateCutoff: DASHBOARD_LATE_CUTOFF_HHMM,
      employees: {
        enrolled: enrolledEmployees,
        presentToday,
        lateToday,
        absentToday: Math.max(0, enrolledEmployees - presentToday),
      },
      contractors: {
        enrolled: contractorEnrolled,
        presentToday: contractorPresentToday,
        lateToday: contractorLateToday,
        absentToday: Math.max(0, contractorEnrolled - contractorPresentToday),
      },
    };
  }

  /**
   * Reject an enrollment if its embedding is too similar to one already on
   * file for a *different* employee in the same client. Threshold:
   * DUPLICATE_FACE_THRESHOLD (mapped (cos+1)/2). Throws ConflictException
   * naming the existing employee so the admin can investigate.
   *
   * Phase 4b: also scans contractor_face_enrollments so a face that's
   * already enrolled to a contractor employee cannot be silently re-used
   * for a new in-house employee enrollment.
   */
  private async assertFaceNotDuplicate(
    clientId: string,
    employeeId: string,
    embeddingBuf: Buffer,
  ): Promise<void> {
    const probe = decodeEmbedding(embeddingBuf);
    if (!probe) return; // can't validate malformed buffers; let DB write fail later
    const best = await this.findBestDuplicateMatch(probe, clientId, {
      excludeEmployeeId: employeeId,
      excludeContractorEmployeeId: null,
    });
    if (!best || best.score < DUPLICATE_FACE_THRESHOLD) return;

    // Redacted error: do NOT reveal which employee/contractor the face
    // matched. The full match details (score, target id) are persisted to
    // face_duplicate_attempt_logs so an admin can still investigate, but
    // the caller only learns that the face is already registered. This
    // prevents the enrol endpoint from being used as a roster oracle.
    if (best.kind === 'employee') {
      await this.logDuplicateAttempt({
        clientId,
        attemptingEmployeeId: employeeId,
        matchedEmployeeId: best.id,
        score: best.score,
        source: 'enroll',
      });
    } else {
      await this.logDuplicateAttempt({
        clientId,
        attemptingEmployeeId: employeeId,
        matchedContractorEmployeeId: best.id,
        score: best.score,
        source: 'enroll-cross',
      });
    }
    throw new ConflictException(
      'This face is already registered in the system. Contact your administrator to resolve the duplicate before enrolling.',
    );
  }

  /**
   * Phase 4b: symmetric guard for contractor enrollment. Scans both
   * contractor_face_enrollments (excluding self) and face_enrollments.
   */
  private async assertContractorFaceNotDuplicate(
    clientId: string,
    contractorEmployeeId: string,
    embeddingBuf: Buffer,
  ): Promise<void> {
    const probe = decodeEmbedding(embeddingBuf);
    if (!probe) return;
    const best = await this.findBestDuplicateMatch(probe, clientId, {
      excludeEmployeeId: null,
      excludeContractorEmployeeId: contractorEmployeeId,
    });
    if (!best || best.score < DUPLICATE_FACE_THRESHOLD) return;

    if (best.kind === 'contractor') {
      await this.logDuplicateAttempt({
        clientId,
        attemptingContractorEmployeeId: contractorEmployeeId,
        matchedContractorEmployeeId: best.id,
        score: best.score,
        source: 'enroll-contractor',
      });
    } else {
      await this.logDuplicateAttempt({
        clientId,
        attemptingContractorEmployeeId: contractorEmployeeId,
        matchedEmployeeId: best.id,
        score: best.score,
        source: 'enroll-cross',
      });
    }
    throw new ConflictException(
      'This face is already registered in the system. Contact your administrator to resolve the duplicate before enrolling.',
    );
  }

  /**
   * Cross-table best-match scan used by both enrollment guards. Returns
   * the highest-scoring active enrollment in either face_enrollments or
   * contractor_face_enrollments for the given client, excluding the
   * subject itself.
   */
  private async findBestDuplicateMatch(
    probe: Float32Array,
    clientId: string,
    exclude: {
      excludeEmployeeId: string | null;
      excludeContractorEmployeeId: string | null;
    },
  ): Promise<{
    kind: 'employee' | 'contractor';
    id: string;
    label: string;
    score: number;
  } | null> {
    let bestKind: 'employee' | 'contractor' | null = null;
    let bestId: string | null = null;
    let bestScore = -Infinity;

    const empRows = await this.faceRepo.find({
      where: { clientId, isActive: true },
    });
    for (const r of empRows) {
      if (
        exclude.excludeEmployeeId &&
        r.employeeId === exclude.excludeEmployeeId
      )
        continue;
      const cand = decodeEmbedding(r.embedding);
      if (!cand || cand.length !== probe.length) continue;
      const s = toMatchScore(cosineSim(probe, cand));
      if (s > bestScore) {
        bestScore = s;
        bestId = r.employeeId;
        bestKind = 'employee';
      }
    }

    const ctrRows = await this.contractorFaceRepo.find({
      where: { clientId, isActive: true },
    });
    for (const r of ctrRows) {
      if (
        exclude.excludeContractorEmployeeId &&
        r.contractorEmployeeId === exclude.excludeContractorEmployeeId
      ) {
        continue;
      }
      const cand = decodeEmbedding(r.embedding);
      if (!cand || cand.length !== probe.length) continue;
      const s = toMatchScore(cosineSim(probe, cand));
      if (s > bestScore) {
        bestScore = s;
        bestId = r.contractorEmployeeId;
        bestKind = 'contractor';
      }
    }

    if (!bestKind || !bestId) return null;

    let label = bestId;
    if (bestKind === 'employee') {
      const dup = await this.empRepo.findOne({ where: { id: bestId } });
      if (dup)
        label = `${dup.employeeCode ?? dup.id} (${dup.name ?? 'unknown'})`;
    } else {
      const dup = await this.contractorEmpRepo.findOne({
        where: { id: bestId },
      });
      if (dup) label = dup.name ?? bestId;
    }
    return { kind: bestKind, id: bestId, label, score: bestScore };
  }

  // ------------------------------------------------------ liveness challenge
  // Phase 4c: nonce-bound active liveness. The device first calls
  // `issueLivenessChallenge`, performs the returned action (BLINK /
  // HEAD_TURN / SMILE), then echoes the nonce back on the next punch.
  // The server consumes the nonce atomically inside the punch flow so a
  // captured-and-replayed nonce cannot be reused.
  async issueLivenessChallenge(
    device: MobileAttendanceDeviceEntity,
    employeeId: string | null,
  ): Promise<{ nonce: string; challengeType: string; expiresAt: string }> {
    const nonce = randomBytes(24).toString('base64url');
    const challengeType =
      LIVENESS_CHALLENGE_TYPES[
        Math.floor(Math.random() * LIVENESS_CHALLENGE_TYPES.length)
      ];
    const expiresAt = new Date(Date.now() + LIVENESS_NONCE_TTL_MS);
    await this.nonceRepo.insert({
      clientId: device.clientId,
      deviceId: device.id,
      employeeId,
      nonce,
      challengeType,
      expiresAt,
      consumedAt: null,
    });
    return {
      nonce,
      challengeType,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Atomically validate + consume a nonce. Returns true iff a row was
   *  flipped from unconsumed→consumed in this call. Scoped to the
   *  device so a nonce issued to one device cannot be punched by
   *  another. */
  private async consumeLivenessNonce(
    deviceId: string,
    nonce: string,
  ): Promise<{ ok: boolean; challengeType: string | null }> {
    const rows: Array<{ challenge_type: string }> = await this.ds.query(
      `UPDATE face_liveness_nonces
          SET consumed_at = NOW()
        WHERE nonce = $1
          AND device_id = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING challenge_type`,
      [nonce, deviceId],
    );
    if (rows.length === 0) return { ok: false, challengeType: null };
    return { ok: true, challengeType: rows[0].challenge_type };
  }

  /** Best-effort cleanup of expired + old consumed nonces. Called from
   *  the daily retention cron. */
  async cleanupExpiredLivenessNonces(): Promise<number> {
    const res = await this.ds.query(
      `DELETE FROM face_liveness_nonces
        WHERE expires_at < NOW() - INTERVAL '1 hour'
           OR (consumed_at IS NOT NULL
               AND consumed_at < NOW() - INTERVAL '7 days')`,
    );
    return Array.isArray(res) ? 0 : (res?.rowCount ?? 0);
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
    meta?: PunchRequestMeta,
  ) {
    try {
      return await this._recordPunchInner(device, body, actorEmployeeId, meta);
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
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
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
      this.maybeAlertRepeatedDeviceFailures(
        device.clientId,
        device.id,
        reason,
      ).catch((err) =>
        this.logger.warn(`device alert hook failed: ${err?.message ?? err}`),
      );
      throw e;
    }
  }

  private async _recordPunchInner(
    device: MobileAttendanceDeviceEntity,
    body: MobilePunchDto,
    actorEmployeeId?: string | null,
    meta?: PunchRequestMeta,
  ) {
    // ESS mode: punch must be for the bound employee. Prefer the device
    // binding (it's authoritative) over the supplied employeeId.
    const expectedEmpId =
      device.mode === 'ESS' ? (device.essEmployeeId ?? actorEmployeeId) : null;
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

    // Phase 3f hardening: the device-side matcher may be stale (e.g. an
    // enrollment was deleted/re-assigned after the kiosk last fetched the
    // roster). Without this guard a stale matcher could keep posting
    // punches for a deleted enrollment until the roster TTL refresh
    // catches up. Require an active face enrollment for the claimed
    // employee before accepting any punch.
    const activeEnrollment = await this.faceRepo.findOne({
      where: { employeeId: emp.id, clientId: device.clientId, isActive: true },
    });
    if (!activeEnrollment) {
      throw new ForbiddenException(
        `No active face enrollment for employee ${emp.employeeCode ?? emp.id} — ` +
          `the device roster is stale. Please re-open the app to refresh.`,
      );
    }

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
    //
    // Phase 3f / 4c: server-side embedding re-verification. When the
    // device includes its probe embedding we recompute the cosine against
    // the stored enrollment and use THAT score for the threshold gate.
    // PUNCH_REQUIRE_SERVER_PROBE (default true) makes the probe field
    // mandatory — a tampered APK can no longer post a synthetic
    // matchScore for any employeeId. The fallback that trusts
    // body.matchScore is kept behind the env flag for emergency rollback
    // only.
    if (PUNCH_REQUIRE_SERVER_PROBE && !body.probeEmbeddingB64) {
      throw new BadRequestException(
        'probeEmbeddingB64 is required on punch — please update the attendance app',
      );
    }
    let effectiveMatchScore: number | null = body.matchScore ?? null;
    if (body.probeEmbeddingB64) {
      const serverScore = await this.verifyProbeAgainstEnrollment(
        body.probeEmbeddingB64,
        emp.id,
        device.clientId,
        false,
      );
      effectiveMatchScore = serverScore;
      if (serverScore < MIN_MATCH_SCORE) {
        throw new BadRequestException(
          `Server face match score ${serverScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
        );
      }
    } else if (body.matchScore != null && body.matchScore < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `Face match score ${body.matchScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
      );
    }
    if (body.livenessScore != null && body.livenessScore < MIN_LIVENESS_SCORE) {
      throw new BadRequestException('Liveness check failed');
    }

    // Roadmap #11 / K11: pluggable PAD anti-spoof gate. Defaults to
    // noop until FACE_ANTISPOOF_PROVIDER picks a real implementation.
    const padResult = await this.padProvider.check({
      livenessScore: body.livenessScore ?? null,
      matchScore: effectiveMatchScore,
      probeEmbeddingB64: body.probeEmbeddingB64 ?? null,
    });
    if (!padResult.ok) {
      throw new BadRequestException(
        padResult.reason || 'Anti-spoof check failed',
      );
    }

    // Phase 4c: nonce-bound active liveness. The device must first call
    // POST /mobile-attendance/liveness/challenge, perform the returned
    // challenge type, then echo the nonce on the punch. The server
    // atomically consumes the nonce here so a captured payload cannot be
    // replayed. The client-supplied livenessChallengeType + timestamp are
    // still validated for backwards compatibility but are NOT trusted on
    // their own — the nonce is the authoritative gate.
    if (LIVENESS_CHALLENGE_REQUIRED) {
      if (!body.livenessNonce) {
        throw new BadRequestException(
          'Active liveness challenge required (request a challenge and try again)',
        );
      }
      const consumed = await this.consumeLivenessNonce(
        device.id,
        body.livenessNonce,
      );
      if (!consumed.ok) {
        throw new BadRequestException(
          'Liveness challenge expired or already used — please retake the action',
        );
      }
      if (
        body.livenessChallengeType &&
        body.livenessChallengeType !== consumed.challengeType
      ) {
        throw new BadRequestException(
          'Liveness challenge type mismatch — please retake the action',
        );
      }
      if (body.livenessChallengePassedAt) {
        const passedAt = Date.parse(body.livenessChallengePassedAt);
        if (Number.isNaN(passedAt)) {
          throw new BadRequestException('Invalid liveness challenge timestamp');
        }
        const ageMs = Date.now() - passedAt;
        if (
          ageMs < -LIVENESS_CHALLENGE_MAX_AGE_MS ||
          ageMs > LIVENESS_CHALLENGE_MAX_AGE_MS
        ) {
          throw new BadRequestException(
            'Liveness challenge timestamp out of range — check device clock',
          );
        }
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
    if (isNaN(ts.getTime())) throw new BadRequestException('Invalid punchTime');

    // Roadmap #7 / K10: shift validation. Loads the employee's active
    // shift row (if any) and either warns or rejects punches outside
    // the configured window. Default mode is `off` so absence of a row
    // or the table itself is fully safe.
    {
      const mode = getShiftMode();
      if (mode !== 'off') {
        const shift = await this.attendanceShiftRepo.findOne({
          where: { employeeId: emp.id, active: true },
        });
        const result = validateAgainstShift(
          shift,
          (body.direction ?? 'AUTO') as 'IN' | 'OUT' | 'AUTO',
          ts,
        );
        if (result.hasShift && !result.withinWindow) {
          if (mode === 'enforce') {
            throw new BadRequestException(
              result.reason || 'Punch outside shift window',
            );
          }
          this.logger.warn(
            `[shift] ${emp.employeeCode ?? emp.id} ${result.reason} (warn-only)`,
          );
        }
      }
    }
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
      if (
        last.direction === 'OUT' &&
        elapsed >= 0 &&
        elapsed < POST_LOGOUT_COOLDOWN_MS
      ) {
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
             source = $9,
             capture_ip = $14,
             capture_user_agent = $15
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
        effectiveMatchScore,
        body.livenessScore ?? null,
        body.matchProvider ?? 'mobilefacenet',
        source,
        device.clientId,
        emp.employeeCode,
        ts,
        `mobile:${device.id}`,
        meta?.ip ?? null,
        meta?.userAgent ?? null,
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

  // -------------------------------------------------- contractor punch (4d)
  // KIOSK-only entry: writes to the parallel contractor_biometric_punches
  // table so employee payroll roll-ups stay untouched. Runs the same safety
  // gates as the in-house path (clock-skew, mock GPS, quality, liveness
  // challenge, geofence, post-logout cooldown). Idempotent via the unique
  // (client_id, contractor_employee_id, punch_time) index.
  async recordContractorPunch(
    device: MobileAttendanceDeviceEntity,
    body: ContractorMobilePunchDto,
    meta?: PunchRequestMeta,
  ) {
    try {
      return await this._recordContractorPunchInner(device, body, meta);
    } catch (e: any) {
      const reason = classifyRejection(e);
      await this.logFailedScan({
        clientId: device.clientId,
        branchId: device.branchId ?? null,
        deviceId: device.id,
        employeeId: null,
        employeeCode: null,
        contractorEmployeeId: body.contractorEmployeeId ?? null,
        reason,
        reasonDetail: typeof e?.message === 'string' ? e.message : String(e),
        matchScore: body.matchScore ?? null,
        livenessScore: body.livenessScore ?? null,
        captureLat: body.captureLat ?? null,
        captureLng: body.captureLng ?? null,
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
      });
      if (body.contractorEmployeeId) {
        this.maybeAlertRepeatedContractorFailures(
          device.clientId,
          body.contractorEmployeeId,
          reason,
        ).catch((err) =>
          this.logger.warn(`alert hook failed: ${err?.message ?? err}`),
        );
      }
      this.maybeAlertRepeatedDeviceFailures(
        device.clientId,
        device.id,
        reason,
      ).catch((err) =>
        this.logger.warn(`device alert hook failed: ${err?.message ?? err}`),
      );
      throw e;
    }
  }

  private async _recordContractorPunchInner(
    device: MobileAttendanceDeviceEntity,
    body: ContractorMobilePunchDto,
    meta?: PunchRequestMeta,
  ) {
    if (device.mode !== 'KIOSK') {
      throw new ForbiddenException(
        'Contractor punches are only allowed from KIOSK devices',
      );
    }

    const ctr = await this.contractorEmpRepo.findOne({
      where: { id: body.contractorEmployeeId, clientId: device.clientId },
    });
    if (!ctr) throw new NotFoundException('Contractor employee not found');

    // Phase 3f hardening parity: require an active contractor face
    // enrollment so a stale kiosk roster cannot keep posting punches
    // against a deleted enrollment. See _recordPunchInner for rationale.
    const activeCtrEnrollment = await this.contractorFaceRepo.findOne({
      where: {
        contractorEmployeeId: ctr.id,
        clientId: device.clientId,
        isActive: true,
      },
    });
    if (!activeCtrEnrollment) {
      throw new ForbiddenException(
        `No active face enrollment for contractor ${ctr.id} — the device ` +
          `roster is stale. Please re-open the app to refresh.`,
      );
    }

    // Integrity gates BEFORE quality so spoofed punches surface clearly.
    if (body.isMockLocation === true) {
      throw new ForbiddenException(
        'Mock location detected — attendance blocked. Disable fake-GPS apps and try again.',
      );
    }
    if (body.isRooted === true) {
      this.logger.warn(
        `recordContractorPunch rooted-device contractorEmpId=${ctr.id} client=${device.clientId} device=${device.id}`,
      );
      // Soft-block (parity with employee path).
    }

    if (PUNCH_REQUIRE_SERVER_PROBE && !body.probeEmbeddingB64) {
      throw new BadRequestException(
        'probeEmbeddingB64 is required on punch — please update the attendance app',
      );
    }
    if (body.matchScore != null && body.matchScore < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `Face match score ${body.matchScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
      );
    }
    if (body.livenessScore != null && body.livenessScore < MIN_LIVENESS_SCORE) {
      throw new BadRequestException('Liveness check failed');
    }

    // Phase 3f: server-side embedding re-verification (contractor parity).
    let effectiveMatchScore: number | null = body.matchScore ?? null;
    if (body.probeEmbeddingB64) {
      const serverScore = await this.verifyProbeAgainstEnrollment(
        body.probeEmbeddingB64,
        ctr.id,
        device.clientId,
        true,
      );
      effectiveMatchScore = serverScore;
      if (serverScore < MIN_MATCH_SCORE) {
        throw new BadRequestException(
          `Server face match score ${serverScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
        );
      }
    }

    // Roadmap #11 / K11: PAD anti-spoof gate (contractor parity).
    const padResult = await this.padProvider.check({
      livenessScore: body.livenessScore ?? null,
      matchScore: effectiveMatchScore,
      probeEmbeddingB64: body.probeEmbeddingB64 ?? null,
    });
    if (!padResult.ok) {
      throw new BadRequestException(
        padResult.reason || 'Anti-spoof check failed',
      );
    }

    if (LIVENESS_CHALLENGE_REQUIRED) {
      if (!body.livenessNonce) {
        throw new BadRequestException(
          'Active liveness challenge required (request a challenge and try again)',
        );
      }
      const consumed = await this.consumeLivenessNonce(
        device.id,
        body.livenessNonce,
      );
      if (!consumed.ok) {
        throw new BadRequestException(
          'Liveness challenge expired or already used — please retake the action',
        );
      }
      if (
        body.livenessChallengeType &&
        body.livenessChallengeType !== consumed.challengeType
      ) {
        throw new BadRequestException(
          'Liveness challenge type mismatch — please retake the action',
        );
      }
      if (body.livenessChallengePassedAt) {
        const passedAt = Date.parse(body.livenessChallengePassedAt);
        if (Number.isNaN(passedAt)) {
          throw new BadRequestException('Invalid liveness challenge timestamp');
        }
        const ageMs = Date.now() - passedAt;
        if (
          ageMs < -LIVENESS_CHALLENGE_MAX_AGE_MS ||
          ageMs > LIVENESS_CHALLENGE_MAX_AGE_MS
        ) {
          throw new BadRequestException(
            'Liveness challenge timestamp out of range — check device clock',
          );
        }
      }
    }

    // Kiosk geofence is fixed (device location is the site); no per-punch
    // geofence check here for parity with the employee KIOSK path.

    const ts = new Date(body.punchTime);
    if (isNaN(ts.getTime())) throw new BadRequestException('Invalid punchTime');

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

    // Post-logout cooldown against the contractor's own punch history.
    const lastRows: Array<{ punch_time: Date; direction: string }> =
      await this.contractorPunchRepo.manager.query(
        `SELECT punch_time, direction
           FROM contractor_biometric_punches
          WHERE client_id = $1
            AND contractor_employee_id = $2
            AND punch_time <= $3
          ORDER BY punch_time DESC
          LIMIT 1`,
        [device.clientId, ctr.id, ts],
      );
    if (lastRows.length) {
      const last = lastRows[0];
      const lastMs = new Date(last.punch_time).getTime();
      const elapsed = ts.getTime() - lastMs;
      if (
        last.direction === 'OUT' &&
        elapsed >= 0 &&
        elapsed < POST_LOGOUT_COOLDOWN_MS
      ) {
        const remainMs = POST_LOGOUT_COOLDOWN_MS - elapsed;
        const h = Math.floor(remainMs / (60 * 60 * 1000));
        const m = Math.ceil((remainMs - h * 60 * 60 * 1000) / 60000);
        throw new ForbiddenException(
          `Logout already recorded. Next punch allowed after the 8h rest window — please wait ${h}h ${m}m.`,
        );
      }
    }

    const photoUrl = await this.facePhotos.put({
      clientId: device.clientId,
      employeeCode: `contractor-${ctr.id}`,
      purpose: 'punch',
      timestamp: ts,
      photoB64: body.photoB64,
    });

    // INSERT ... ON CONFLICT DO NOTHING gives idempotency: a replayed
    // offline-queue row or a network-retry produces no duplicate. RETURNING
    // tells us whether this call actually inserted.
    const inserted: Array<{ id: string }> =
      await this.contractorPunchRepo.manager.query(
        `INSERT INTO contractor_biometric_punches
           (client_id, branch_id, contractor_employee_id, punch_time, direction,
            source, mobile_device_id, device_id, capture_lat, capture_lng,
            capture_accuracy_m, photo_url, match_score, liveness_score,
            match_provider, capture_ip, capture_user_agent)
         VALUES ($1, $2, $3, $4, $5, 'MOBILE_KIOSK', $6, $7, $8, $9, $10, $11,
                 $12, $13, $14, $15, $16)
         ON CONFLICT (client_id, contractor_employee_id, punch_time) DO NOTHING
         RETURNING id`,
        [
          device.clientId,
          ctr.branchId ?? device.branchId ?? null,
          ctr.id,
          ts,
          body.direction ?? 'AUTO',
          device.id,
          `mobile:${device.id}`,
          body.captureLat ?? null,
          body.captureLng ?? null,
          body.captureAccuracyM ?? null,
          photoUrl,
          effectiveMatchScore,
          body.livenessScore ?? null,
          body.matchProvider ?? 'mobilefacenet',
          meta?.ip ?? null,
          meta?.userAgent ?? null,
        ],
      );

    await this.deviceRepo.update(device.id, { lastPunchAt: ts });

    return {
      ok: true,
      duplicate: inserted.length === 0,
      contractorEmployeeId: ctr.id,
      contractorName: ctr.name,
      punchTime: ts.toISOString(),
      mode: device.mode,
    };
  }

  // ------------------------------------------------ embedding verification

  /**
   * Phase 3f: recompute cosine match between a device-supplied probe
   * embedding (base64 little-endian Float32, 192 dims) and the stored
   * enrollment for the given employee / contractor employee. Returns the
   * server-computed match score in [0,1]. Throws when the probe is
   * malformed, no active enrollment exists, or the dimensions disagree.
   */
  private async verifyProbeAgainstEnrollment(
    probeB64: string,
    subjectId: string,
    clientId: string,
    isContractor: boolean,
  ): Promise<number> {
    let probeBuf: Buffer;
    try {
      probeBuf = Buffer.from(probeB64, 'base64');
    } catch {
      throw new BadRequestException('Invalid probe embedding encoding');
    }
    const probe = decodeEmbedding(probeBuf);
    if (!probe) {
      throw new BadRequestException('Malformed probe embedding');
    }

    const enrollment = isContractor
      ? await this.contractorFaceRepo.findOne({
          where: { contractorEmployeeId: subjectId, clientId, isActive: true },
        })
      : await this.faceRepo.findOne({
          where: { employeeId: subjectId, clientId, isActive: true },
        });
    if (!enrollment || !enrollment.embedding) {
      throw new BadRequestException(
        'No active face enrollment found for this subject',
      );
    }
    const stored = decodeEmbedding(enrollment.embedding);
    if (!stored) {
      throw new BadRequestException('Stored enrollment is malformed');
    }
    if (stored.length !== probe.length) {
      throw new BadRequestException(
        `Probe/enrollment dimension mismatch (probe=${probe.length}, stored=${stored.length})`,
      );
    }
    const cos = cosineSim(probe, stored);
    return toMatchScore(cos);
  }

  // ----------------------------------------------------------- audit logs

  /** Append a row to face_failed_scan_logs. Best-effort: never throws. */
  private async logFailedScan(input: {
    clientId: string;
    branchId: string | null;
    deviceId: string | null;
    employeeId: string | null;
    employeeCode: string | null;
    contractorEmployeeId?: string | null;
    reason: string;
    reasonDetail: string | null;
    matchScore: number | null;
    livenessScore: number | null;
    captureLat: number | null;
    captureLng: number | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      await this.faceRepo.manager.query(
        `INSERT INTO face_failed_scan_logs
           (client_id, branch_id, device_id, employee_id, employee_code,
            contractor_employee_id, reason, reason_detail, match_score,
            liveness_score, capture_lat, capture_lng, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          input.clientId,
          input.branchId,
          input.deviceId,
          input.employeeId,
          input.employeeCode,
          input.contractorEmployeeId ?? null,
          input.reason,
          input.reasonDetail,
          input.matchScore,
          input.livenessScore,
          input.captureLat,
          input.captureLng,
          input.ip ?? null,
          input.userAgent ?? null,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`logFailedScan failed: ${e?.message ?? e}`);
    }
  }

  /** Append a row to face_duplicate_attempt_logs. Best-effort: never throws. */
  private async logDuplicateAttempt(input: {
    clientId: string;
    attemptingEmployeeId?: string | null;
    attemptingContractorEmployeeId?: string | null;
    matchedEmployeeId?: string | null;
    matchedContractorEmployeeId?: string | null;
    score: number;
    source: string;
    actorUserId?: string | null;
  }): Promise<void> {
    try {
      await this.faceRepo.manager.query(
        `INSERT INTO face_duplicate_attempt_logs
           (client_id, attempting_employee_id, attempting_contractor_employee_id,
            matched_employee_id, matched_contractor_employee_id,
            match_score, attempted_by_user_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.clientId,
          input.attemptingEmployeeId ?? null,
          input.attemptingContractorEmployeeId ?? null,
          input.matchedEmployeeId ?? null,
          input.matchedContractorEmployeeId ?? null,
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
    action: 'ENROLL' | 'RE_ENROLL' | 'DEACTIVATE' | 'REACTIVATE' | 'DELETE';
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
    if (!body.photoBase64) {
      throw new BadRequestException(
        'photoBase64 is required for contractor enrolment (server recomputes the embedding)',
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

    if (!this.faceEmbeddingClient.isEnabled()) {
      throw new BadRequestException(
        'Server-side face embedding is not configured (FACE_SVC_URL unset)',
      );
    }
    const result = await this.faceEmbeddingClient.embedPhoto(body.photoBase64);
    if (!result) {
      throw new BadRequestException('Face embedding service unavailable');
    }
    const embedding: Buffer = Buffer.from(result.embeddingBase64, 'base64');
    const embeddingModel: string = body.embeddingModel || result.embeddingModel;
    if (result.faceScore < MIN_FACE_QUALITY_SCORE) {
      throw new BadRequestException(
        `Face image quality too low (score ${result.faceScore.toFixed(2)} < ${MIN_FACE_QUALITY_SCORE}) — ` +
          `retake the photo with better lighting and the face clearly centered`,
      );
    }
    this.logger.log(
      `enrollContractorFace photo→embed ok contractorEmp=${ce.id} bytes=${embedding.length}`,
    );

    // Phase 4b: cross-table duplicate-face guard. Reject if this face is
    // already enrolled to a different employee OR a different contractor
    // employee in the same client.
    if (embedding) {
      await this.assertContractorFaceNotDuplicate(clientId, ce.id, embedding);
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
    // Phase 4c / DPDP: crypto-shred the embedding (see deactivateEnrollment).
    if (row.embedding && row.embedding.length > 0) {
      row.embedding = randomBytes(row.embedding.length);
    }
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
   * Hard-delete a contractor face enrollment row. Mirror of
   * `deleteEnrollment` for contractor employees. Audit-log append and
   * row removal run in a single transaction.
   */
  async deleteContractorEnrollment(
    clientId: string,
    contractorEmployeeId: string,
    by: string | null,
    reason: string,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; deleted: true; contractorEmployeeId: string }> {
    const row = await this.contractorFaceRepo.findOne({
      where: { contractorEmployeeId, clientId },
    });
    if (!row) throw new NotFoundException('Contractor enrollment not found');
    if (allowedBranchIds && !allowedBranchIds.includes(row.branchId ?? '')) {
      throw new ForbiddenException(
        'Contractor employee is not in your branch scope',
      );
    }
    await this.contractorFaceRepo.manager.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO contractor_face_enrollment_history
           (contractor_employee_id, client_id, action, reason,
            embedding_model, actor_user_id)
         VALUES ($1, $2, 'DELETE', $3, $4, $5)`,
        [
          contractorEmployeeId,
          clientId,
          reason,
          row.embeddingModel ?? null,
          by ?? null,
        ],
      );
      // Phase 4c / DPDP: shred embedding bytes before delete (see
      // deleteEnrollment for the MVCC caveat — full shred only completes
      // once autovacuum reclaims the original tuple version).
      if (row.embedding && row.embedding.length > 0) {
        await tx.update(
          ContractorFaceEnrollmentEntity,
          { contractorEmployeeId, clientId },
          { embedding: randomBytes(row.embedding.length) },
        );
      }
      await tx.delete(ContractorFaceEnrollmentEntity, {
        contractorEmployeeId,
        clientId,
      });
    });
    return { ok: true, deleted: true, contractorEmployeeId };
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
    action: 'ENROLL' | 'RE_ENROLL' | 'DEACTIVATE' | 'REACTIVATE' | 'DELETE';
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

  // ------------ Phase 4c: contractor re-enrollment approval workflow.
  //
  // Mirror of Phase 3e (createReenrollRequest / listReenrollRequests /
  // reviewReenrollRequest) but keyed by contractor_employees.id and
  // writing to contractor_face_reenrollment_requests +
  // contractor_face_enrollments + contractor_face_enrollment_history.

  /**
   * Stash a pending re-enrollment request for a contractor employee. The
   * new embedding lives in contractor_face_reenrollment_requests until a
   * reviewer approves it; the live contractor_face_enrollments row is
   * untouched. If no active enrollment exists, falls through (no-one is
   * being overwritten).
   */
  async createContractorReenrollRequest(
    clientId: string,
    requestedBy: string | null,
    body: import('./mobile-attendance.dto').CreateContractorReenrollRequestDto,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; pending: boolean; requestId?: string }> {
    const ce = await this.contractorEmpRepo.findOne({
      where: { id: body.contractorEmployeeId, clientId },
    });
    if (!ce) throw new NotFoundException('Contractor employee not found');
    if (allowedBranchIds && !allowedBranchIds.includes(ce.branchId ?? '')) {
      throw new ForbiddenException(
        'Contractor employee is not in your branch scope',
      );
    }
    const embedding = Buffer.from(body.embeddingBase64, 'base64');

    const existing = await this.contractorFaceRepo.findOne({
      where: { contractorEmployeeId: ce.id, isActive: true },
    });
    if (!existing) {
      this.logger.log(
        `createContractorReenrollRequest: no active enrollment for contractor=${ce.id}, deferring to enroll flow`,
      );
      return { ok: true, pending: false };
    }

    // Block obvious duplicates across both tables. Approval can't repair a
    // cross-table collision — admin must resolve the duplicate first.
    await this.assertContractorFaceNotDuplicate(clientId, ce.id, embedding);

    const photoUrl = await this.facePhotos.put({
      clientId,
      employeeCode: `contractor-${ce.id}`,
      purpose: 'enroll',
      timestamp: new Date(),
      photoB64: body.photoBase64,
    });

    const rows: Array<{ id: string }> =
      await this.contractorFaceRepo.manager.query(
        `INSERT INTO contractor_face_reenrollment_requests
           (client_id, contractor_employee_id, branch_id, requested_by, reason,
            embedding, embedding_model, photo_url, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          clientId,
          ce.id,
          ce.branchId ?? null,
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

  /**
   * Admin/CRM read endpoint: recent contractor kiosk punches with optional
   * window + contractor/branch filters. Branch-scoped users only see their
   * own branches. Returns at most `limit` rows (default 100, max 500).
   */
  async listContractorPunches(
    clientId: string,
    opts: {
      from?: string | null;
      to?: string | null;
      branchId?: string | null;
      contractorEmployeeId?: string | null;
      contractorUserId?: string | null;
      limit?: number | null;
    },
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
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
    }>
  > {
    const params: any[] = [clientId];
    const where: string[] = ['p.client_id = $1'];

    if (opts.from) {
      params.push(opts.from);
      where.push(`p.punch_time >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`p.punch_time <= $${params.length}`);
    }
    if (opts.contractorEmployeeId) {
      params.push(opts.contractorEmployeeId);
      where.push(`p.contractor_employee_id = $${params.length}`);
    }
    if (opts.contractorUserId) {
      params.push(opts.contractorUserId);
      where.push(`ce.contractor_user_id = $${params.length}`);
    }
    if (opts.branchId) {
      params.push(opts.branchId);
      where.push(`p.branch_id = $${params.length}`);
    }
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      where.push(`p.branch_id = ANY($${params.length}::uuid[])`);
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      return [];
    }

    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);

    return this.contractorPunchRepo.manager.query(
      `SELECT p.id,
              p.contractor_employee_id AS "contractorEmployeeId",
              ce.name AS "contractorEmployeeName",
              ce.contractor_user_id AS "contractorUserId",
              cu.name AS "contractorName",
              p.branch_id AS "branchId",
              p.punch_time AS "punchTime",
              p.direction, p.source,
              p.device_id AS "deviceId",
              p.photo_url AS "photoUrl",
              p.match_score AS "matchScore",
              p.liveness_score AS "livenessScore",
              p.capture_lat AS "captureLat",
              p.capture_lng AS "captureLng"
         FROM contractor_biometric_punches p
         LEFT JOIN contractor_employees ce ON ce.id = p.contractor_employee_id
         LEFT JOIN users cu ON cu.id = ce.contractor_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.punch_time DESC
        LIMIT ${limit}`,
      params,
    );
  }

  /**
   * Admin/CRM read endpoint: recent face_failed_scan_logs rows with optional
   * window + subject/reason/branch filters. `subjectType='EMPLOYEE'` returns
   * only in-house employee rejections (employee_id IS NOT NULL).
   * `subjectType='CONTRACTOR'` returns only contractor rejections
   * (contractor_employee_id IS NOT NULL). Branch-scoped users only see their
   * own branches. Returns at most `limit` rows (default 100, max 500).
   */
  async listFailedScans(
    clientId: string,
    opts: {
      from?: string | null;
      to?: string | null;
      branchId?: string | null;
      reason?: string | null;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR' | null;
      employeeId?: string | null;
      contractorEmployeeId?: string | null;
      limit?: number | null;
    },
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
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
    }>
  > {
    const params: any[] = [clientId];
    const where: string[] = ['f.client_id = $1'];

    if (opts.from) {
      params.push(opts.from);
      where.push(`f.attempted_at >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`f.attempted_at <= $${params.length}`);
    }
    if (opts.reason) {
      params.push(opts.reason);
      where.push(`f.reason = $${params.length}`);
    }
    if (opts.subjectType === 'EMPLOYEE') {
      where.push(`f.employee_id IS NOT NULL`);
    } else if (opts.subjectType === 'CONTRACTOR') {
      where.push(`f.contractor_employee_id IS NOT NULL`);
    }
    if (opts.employeeId) {
      params.push(opts.employeeId);
      where.push(`f.employee_id = $${params.length}`);
    }
    if (opts.contractorEmployeeId) {
      params.push(opts.contractorEmployeeId);
      where.push(`f.contractor_employee_id = $${params.length}`);
    }
    if (opts.branchId) {
      params.push(opts.branchId);
      where.push(`f.branch_id = $${params.length}`);
    }
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      where.push(`f.branch_id = ANY($${params.length}::uuid[])`);
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      return [];
    }

    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);

    return this.faceRepo.manager.query(
      `SELECT f.id,
              f.attempted_at AS "attemptedAt",
              f.branch_id AS "branchId",
              f.device_id AS "deviceId",
              f.employee_id AS "employeeId",
              f.employee_code AS "employeeCode",
              e.name AS "employeeName",
              f.contractor_employee_id AS "contractorEmployeeId",
              ce.name AS "contractorEmployeeName",
              ce.contractor_user_id AS "contractorUserId",
              cu.name AS "contractorName",
              f.reason, f.reason_detail AS "reasonDetail",
              f.match_score AS "matchScore",
              f.liveness_score AS "livenessScore",
              f.capture_lat AS "captureLat",
              f.capture_lng AS "captureLng"
         FROM face_failed_scan_logs f
         LEFT JOIN employees e ON e.id = f.employee_id
         LEFT JOIN contractor_employees ce ON ce.id = f.contractor_employee_id
         LEFT JOIN users cu ON cu.id = ce.contractor_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY f.attempted_at DESC
        LIMIT ${limit}`,
      params,
    );
  }

  /**
   * Aggregations over face_failed_scan_logs for dashboards/heatmaps. Honours
   * the same window/branch/subject filters as listFailedScans. Returns counts
   * grouped by reason, branch, day, and subject type, plus a grand total.
   * Branch-scoped users only see their own branches.
   */
  async failedScanStats(
    clientId: string,
    opts: {
      from?: string | null;
      to?: string | null;
      branchId?: string | null;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR' | null;
    },
    allowedBranchIds: string[] | null = null,
  ): Promise<{
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
  }> {
    const params: any[] = [clientId];
    const where: string[] = ['f.client_id = $1'];

    if (opts.from) {
      params.push(opts.from);
      where.push(`f.attempted_at >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`f.attempted_at <= $${params.length}`);
    }
    if (opts.subjectType === 'EMPLOYEE') {
      where.push(`f.employee_id IS NOT NULL`);
    } else if (opts.subjectType === 'CONTRACTOR') {
      where.push(`f.contractor_employee_id IS NOT NULL`);
    }
    if (opts.branchId) {
      params.push(opts.branchId);
      where.push(`f.branch_id = $${params.length}`);
    }
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      where.push(`f.branch_id = ANY($${params.length}::uuid[])`);
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      return {
        total: 0,
        bySubject: { employee: 0, contractor: 0, unknown: 0 },
        byReason: [],
        byBranch: [],
        byDay: [],
        byHour: [],
        byDevice: [],
        byMode: [],
        byDayOfWeek: [],
      };
    }

    const whereSql = where.join(' AND ');

    const [totalRow] = await this.faceRepo.manager.query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN f.employee_id IS NOT NULL THEN 1 ELSE 0 END)::int AS emp,
              SUM(CASE WHEN f.contractor_employee_id IS NOT NULL THEN 1 ELSE 0 END)::int AS ctr,
              SUM(CASE WHEN f.employee_id IS NULL AND f.contractor_employee_id IS NULL THEN 1 ELSE 0 END)::int AS unk
         FROM face_failed_scan_logs f
        WHERE ${whereSql}`,
      params,
    );

    const byReason = await this.faceRepo.manager.query(
      `SELECT f.reason AS reason, COUNT(*)::int AS count
         FROM face_failed_scan_logs f
        WHERE ${whereSql}
        GROUP BY f.reason
        ORDER BY count DESC, reason ASC`,
      params,
    );

    const byBranch = await this.faceRepo.manager.query(
      `SELECT f.branch_id AS "branchId", b.branchname AS "branchName", COUNT(*)::int AS count
         FROM face_failed_scan_logs f
         LEFT JOIN client_branches b ON b.id = f.branch_id
        WHERE ${whereSql}
        GROUP BY f.branch_id, b.branchname
        ORDER BY count DESC, "branchName" ASC NULLS LAST`,
      params,
    );

    const byDay = await this.faceRepo.manager.query(
      `SELECT TO_CHAR(date_trunc('day', f.attempted_at), 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS count
         FROM face_failed_scan_logs f
        WHERE ${whereSql}
        GROUP BY day
        ORDER BY day ASC`,
      params,
    );

    const byHourRaw = await this.faceRepo.manager.query(
      `SELECT EXTRACT(HOUR FROM f.attempted_at)::int AS hour,
              COUNT(*)::int AS count
         FROM face_failed_scan_logs f
        WHERE ${whereSql}
        GROUP BY hour
        ORDER BY hour ASC`,
      params,
    );
    // Zero-fill 0..23 so the FE sparkline always renders a full day axis.
    const byHourMap = new Map<number, number>();
    for (const r of byHourRaw) byHourMap.set(Number(r.hour), Number(r.count));
    const byHour: Array<{ hour: number; count: number }> = [];
    for (let h = 0; h < 24; h++)
      byHour.push({ hour: h, count: byHourMap.get(h) ?? 0 });

    const byDeviceRaw = await this.faceRepo.manager.query(
      `SELECT f.device_id AS "deviceId",
              MAX(d.device_label) AS "deviceLabel",
              MAX(d.mode) AS "mode",
              MAX(f.attempted_at) AS "lastFailedAt",
              COUNT(*)::int AS count
         FROM face_failed_scan_logs f
         LEFT JOIN mobile_attendance_devices d ON d.id = f.device_id
        WHERE ${whereSql}
        GROUP BY f.device_id
        ORDER BY count DESC, "deviceLabel" ASC NULLS LAST
        LIMIT 20`,
      params,
    );
    const byDevice = byDeviceRaw.map((r) => ({
      deviceId: r.deviceId,
      deviceLabel: r.deviceLabel,
      mode: r.mode,
      lastFailedAt:
        r.lastFailedAt == null ? null : new Date(r.lastFailedAt).toISOString(),
      count: Number(r.count),
    }));

    const byModeRaw = await this.faceRepo.manager.query(
      `SELECT COALESCE(d.mode, 'UNKNOWN') AS mode, COUNT(*)::int AS count
         FROM face_failed_scan_logs f
         LEFT JOIN mobile_attendance_devices d ON d.id = f.device_id
        WHERE ${whereSql}
        GROUP BY COALESCE(d.mode, 'UNKNOWN')
        ORDER BY count DESC, mode ASC`,
      params,
    );
    const byMode = byModeRaw.map((r) => ({
      mode: String(r.mode),
      count: Number(r.count),
    }));

    const byDowRaw = await this.faceRepo.manager.query(
      `SELECT EXTRACT(DOW FROM f.attempted_at)::int AS dow,
              COUNT(*)::int AS count
         FROM face_failed_scan_logs f
        WHERE ${whereSql}
        GROUP BY dow
        ORDER BY dow ASC`,
      params,
    );
    const byDowMap = new Map<number, number>();
    for (const r of byDowRaw) byDowMap.set(Number(r.dow), Number(r.count));
    const byDayOfWeek: Array<{ dow: number; count: number }> = [];
    for (let d = 0; d < 7; d++)
      byDayOfWeek.push({ dow: d, count: byDowMap.get(d) ?? 0 });

    return {
      total: Number(totalRow?.total ?? 0),
      bySubject: {
        employee: Number(totalRow?.emp ?? 0),
        contractor: Number(totalRow?.ctr ?? 0),
        unknown: Number(totalRow?.unk ?? 0),
      },
      byReason,
      byBranch,
      byDay,
      byHour,
      byDevice,
      byMode,
      byDayOfWeek,
    };
  }

  /**
   * Top subjects (employees + contractor workers) ranked by failure count in
   * the window. Honours the same filters as failedScanStats. Useful for
   * spotting recurring offenders / repeat false-rejections.
   */
  async topFailedScanSubjects(
    clientId: string,
    opts: {
      from?: string | null;
      to?: string | null;
      branchId?: string | null;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR' | null;
      limit?: number | null;
      minCount?: number | null;
    },
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
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
    }>
  > {
    const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 100);
    const minCount = Math.max(Number(opts.minCount) || 0, 0);

    const params: any[] = [clientId];
    const where: string[] = ['f.client_id = $1'];
    if (opts.from) {
      params.push(opts.from);
      where.push(`f.attempted_at >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`f.attempted_at <= $${params.length}`);
    }
    if (opts.branchId) {
      params.push(opts.branchId);
      where.push(`f.branch_id = $${params.length}`);
    }
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      where.push(`f.branch_id = ANY($${params.length}::uuid[])`);
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      return [];
    }

    const baseWhere = where.join(' AND ');
    const wantEmp = opts.subjectType !== 'CONTRACTOR';
    const wantCtr = opts.subjectType !== 'EMPLOYEE';

    const rows: Array<{
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
    }> = [];

    if (wantEmp) {
      const empRows = await this.faceRepo.manager.query(
        `SELECT 'EMPLOYEE'::text AS "subjectType",
                f.employee_id AS "employeeId",
                MAX(f.employee_code) AS "employeeCode",
                MAX(e.name) AS "employeeName",
                NULL::uuid AS "contractorEmployeeId",
                NULL::text AS "contractorEmployeeName",
                NULL::text AS "contractorName",
                COUNT(*)::int AS count,
                AVG(f.match_score)::float AS "avgMatchScore",
                MAX(f.attempted_at) AS "lastFailedAt",
                (SELECT reason FROM face_failed_scan_logs ff
                  WHERE ff.client_id = f.client_id AND ff.employee_id = f.employee_id
                  GROUP BY reason ORDER BY COUNT(*) DESC LIMIT 1) AS "topReason"
           FROM face_failed_scan_logs f
           LEFT JOIN employees e ON e.id = f.employee_id
          WHERE ${baseWhere} AND f.employee_id IS NOT NULL
          GROUP BY f.employee_id, f.client_id
          ORDER BY count DESC, "employeeName" ASC NULLS LAST
          LIMIT ${limit}`,
        params,
      );
      rows.push(...empRows);
    }

    if (wantCtr) {
      const ctrRows = await this.faceRepo.manager.query(
        `SELECT 'CONTRACTOR'::text AS "subjectType",
                NULL::uuid AS "employeeId",
                NULL::text AS "employeeCode",
                NULL::text AS "employeeName",
                f.contractor_employee_id AS "contractorEmployeeId",
                MAX(ce.name) AS "contractorEmployeeName",
                MAX(cu.name) AS "contractorName",
                COUNT(*)::int AS count,
                AVG(f.match_score)::float AS "avgMatchScore",
                MAX(f.attempted_at) AS "lastFailedAt",
                (SELECT reason FROM face_failed_scan_logs ff
                  WHERE ff.client_id = f.client_id AND ff.contractor_employee_id = f.contractor_employee_id
                  GROUP BY reason ORDER BY COUNT(*) DESC LIMIT 1) AS "topReason"
           FROM face_failed_scan_logs f
           LEFT JOIN contractor_employees ce ON ce.id = f.contractor_employee_id
           LEFT JOIN users cu ON cu.id = ce.contractor_user_id
          WHERE ${baseWhere} AND f.contractor_employee_id IS NOT NULL
          GROUP BY f.contractor_employee_id, f.client_id
          ORDER BY count DESC, "contractorEmployeeName" ASC NULLS LAST
          LIMIT ${limit}`,
        params,
      );
      rows.push(...ctrRows);
    }

    rows.sort((a, b) => Number(b.count) - Number(a.count));
    const filtered =
      minCount > 0 ? rows.filter((r) => Number(r.count) >= minCount) : rows;
    return filtered.slice(0, limit).map((r) => ({
      ...r,
      count: Number(r.count),
      avgMatchScore: r.avgMatchScore == null ? null : Number(r.avgMatchScore),
      lastFailedAt:
        r.lastFailedAt == null ? null : new Date(r.lastFailedAt).toISOString(),
    }));
  }

  /**
   * Recent face-failure spike alerts emitted by FaceFailureAlertCronService
   * into compliance_notification_center. Returns at most `limit` rows from
   * the last 7 days, newest first. Branch-scoped users only see alerts for
   * their allowed branches.
   */
  async listFaceFailureAlerts(
    clientId: string,
    allowedBranchIds: string[] | null,
    limit = 20,
  ): Promise<
    Array<{
      id: string;
      branchId: string | null;
      title: string;
      message: string | null;
      priority: string;
      createdAt: string;
    }>
  > {
    const params: any[] = [clientId];
    const where: string[] = [
      '"clientId" = $1',
      `module = 'ATTENDANCE'`,
      `"entityType" = 'FACE_FAILURE'`,
      `status = 'OPEN'`,
      `"createdAt" >= NOW() - INTERVAL '7 days'`,
    ];
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      where.push(`"branchId" = ANY($${params.length}::uuid[])`);
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      return [];
    }
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = await this.faceRepo.manager.query(
      `SELECT id, "branchId", title, message, priority, "createdAt"
         FROM compliance_notification_center
        WHERE ${where.join(' AND ')}
        ORDER BY "createdAt" DESC
        LIMIT ${lim}`,
      params,
    );
    return rows.map((r) => ({
      ...r,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));
  }

  /**
   * List distinct contractors (parent vendor users) that have at least one
   * active employee in the caller's allowed branches. Drives the contractor
   * picker on the branch-portal contractor-attendance page.
   */
  async listContractorsForBranch(
    clientId: string,
    opts: { branchId?: string | null } = {},
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
      contractorUserId: string;
      contractorName: string | null;
      contractorEmail: string | null;
      employeeCount: string;
    }>
  > {
    const params: any[] = [clientId];
    const where: string[] = ['ce.client_id = $1', 'ce.is_active = true'];

    if (opts.branchId) {
      params.push(opts.branchId);
      where.push(`ce.branch_id = $${params.length}`);
    }
    if (allowedBranchIds && allowedBranchIds.length > 0) {
      params.push(allowedBranchIds);
      where.push(`ce.branch_id = ANY($${params.length}::uuid[])`);
    } else if (allowedBranchIds && allowedBranchIds.length === 0) {
      return [];
    }

    return this.contractorPunchRepo.manager.query(
      `SELECT ce.contractor_user_id AS "contractorUserId",
              cu.name AS "contractorName",
              cu.email AS "contractorEmail",
              COUNT(ce.id)::text AS "employeeCount"
         FROM contractor_employees ce
         LEFT JOIN users cu ON cu.id = ce.contractor_user_id
        WHERE ${where.join(' AND ')}
        GROUP BY ce.contractor_user_id, cu.name, cu.email
        ORDER BY cu.name NULLS LAST
        LIMIT 500`,
      params,
    );
  }

  async listContractorReenrollRequests(
    clientId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' = 'PENDING',
    allowedBranchIds: string[] | null = null,
  ): Promise<
    Array<{
      id: string;
      contractorEmployeeId: string;
      contractorName: string | null;
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
      return [];
    }
    return this.contractorFaceRepo.manager.query(
      `SELECT r.id,
              r.contractor_employee_id AS "contractorEmployeeId",
              ce.name AS "contractorName",
              r.branch_id AS "branchId",
              r.requested_by AS "requestedBy",
              r.requested_at AS "requestedAt",
              r.reason, r.photo_url AS "photoUrl", r.source, r.status,
              r.reviewed_by AS "reviewedBy",
              r.reviewed_at AS "reviewedAt",
              r.review_notes AS "reviewNotes"
         FROM contractor_face_reenrollment_requests r
         LEFT JOIN contractor_employees ce ON ce.id = r.contractor_employee_id
        WHERE r.client_id = $1
          AND r.status = $2
          ${branchSql}
        ORDER BY r.requested_at DESC
        LIMIT 500`,
      params,
    );
  }

  async reviewContractorReenrollRequest(
    clientId: string,
    requestId: string,
    reviewerUserId: string | null,
    body: import('./mobile-attendance.dto').ReviewReenrollRequestDto,
    allowedBranchIds: string[] | null = null,
  ): Promise<{ ok: true; status: 'APPROVED' | 'REJECTED' }> {
    const rows: Array<{
      id: string;
      client_id: string;
      contractor_employee_id: string;
      branch_id: string | null;
      embedding: Buffer;
      embedding_model: string | null;
      photo_url: string | null;
      status: string;
    }> = await this.contractorFaceRepo.manager.query(
      `SELECT id, client_id, contractor_employee_id, branch_id,
              embedding, embedding_model, photo_url, status
         FROM contractor_face_reenrollment_requests
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
    if (allowedBranchIds && !allowedBranchIds.includes(req.branch_id ?? '')) {
      throw new ForbiddenException('Request is not in your branch scope');
    }

    if (body.decision === 'REJECTED') {
      await this.contractorFaceRepo.manager.query(
        `UPDATE contractor_face_reenrollment_requests
            SET status = 'REJECTED',
                reviewed_by = $1,
                reviewed_at = now(),
                review_notes = $2
          WHERE id = $3`,
        [reviewerUserId, body.notes ?? null, req.id],
      );
      return { ok: true, status: 'REJECTED' };
    }

    // APPROVED: copy the new embedding into contractor_face_enrollments,
    // append a RE_ENROLL row to contractor_face_enrollment_history, then
    // mark the request approved. Single transaction so partial failure
    // doesn't leave a stale PENDING row pointing at an applied embedding.
    await this.contractorFaceRepo.manager.transaction(async (tx) => {
      await tx.query(
        `UPDATE contractor_face_enrollments
            SET embedding = $1,
                embedding_model = COALESCE($2, embedding_model),
                photo_url = COALESCE($3, photo_url),
                is_active = true,
                deactivated_at = NULL,
                deactivation_reason = NULL,
                updated_at = now()
          WHERE contractor_employee_id = $4 AND client_id = $5`,
        [
          req.embedding,
          req.embedding_model,
          req.photo_url,
          req.contractor_employee_id,
          req.client_id,
        ],
      );
      await tx.query(
        `INSERT INTO contractor_face_enrollment_history
           (contractor_employee_id, client_id, action, reason,
            embedding_model, actor_user_id)
         VALUES ($1, $2, 'RE_ENROLL', $3, $4, $5)`,
        [
          req.contractor_employee_id,
          req.client_id,
          body.notes ?? 'Approved re-enrollment request',
          req.embedding_model,
          reviewerUserId,
        ],
      );
      await tx.query(
        `UPDATE contractor_face_reenrollment_requests
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
   * If an employee has accumulated repeated security-relevant rejections
   * within the alert window, raise a system notification. Deduplicated
   * per employee + reason + IST date so admins don't get spammed. Benign
   * reasons (cooldown, employee inactive, clock skew) are filtered out
   * via SUSPICIOUS_REJECTION_REASONS so the signal stays high.
   */
  private async maybeAlertRepeatedFailures(
    clientId: string,
    employeeCode: string,
    reason: string,
  ): Promise<void> {
    if (!SUSPICIOUS_REJECTION_REASONS.has(reason)) return;
    const rows: Array<{ n: string }> = await this.faceRepo.manager.query(
      `SELECT COUNT(*)::text AS n
         FROM face_failed_scan_logs
        WHERE client_id = $1
          AND employee_code = $2
          AND reason = $3
          AND attempted_at >= now() - ($4 || ' minutes')::interval`,
      [clientId, employeeCode, reason, String(REJECTION_ALERT_WINDOW_MIN)],
    );
    const n = Number(rows?.[0]?.n ?? 0);
    if (n < REJECTION_ALERT_THRESHOLD) return;
    const today = new Date().toISOString().slice(0, 10);
    await this.notifications.createSystemNotification({
      clientId,
      sourceKey: `face-mismatch:${employeeCode}:${reason}:${today}`,
      subject: `Repeated face-attendance failures: ${employeeCode}`,
      message:
        `Employee ${employeeCode} has triggered ${n} ${reason} rejections ` +
        `in the last ${REJECTION_ALERT_WINDOW_MIN} minutes today (${today}). ` +
        `Please verify identity and review enrollment.`,
      queryType: 'ATTENDANCE',
      priority: 1,
    });
  }

  /**
   * Contractor equivalent of maybeAlertRepeatedFailures: keyed on
   * contractor_employee_id (contractors have no employee_code). Dedupes
   * per contractor + reason + IST date so admins don't get spammed.
   */
  private async maybeAlertRepeatedContractorFailures(
    clientId: string,
    contractorEmployeeId: string,
    reason: string,
  ): Promise<void> {
    if (!SUSPICIOUS_REJECTION_REASONS.has(reason)) return;
    const rows: Array<{ n: string }> = await this.faceRepo.manager.query(
      `SELECT COUNT(*)::text AS n
         FROM face_failed_scan_logs
        WHERE client_id = $1
          AND contractor_employee_id = $2
          AND reason = $3
          AND attempted_at >= now() - ($4 || ' minutes')::interval`,
      [
        clientId,
        contractorEmployeeId,
        reason,
        String(REJECTION_ALERT_WINDOW_MIN),
      ],
    );
    const n = Number(rows?.[0]?.n ?? 0);
    if (n < REJECTION_ALERT_THRESHOLD) return;
    const ctr = await this.contractorEmpRepo.findOne({
      where: { id: contractorEmployeeId },
    });
    const label = ctr?.name ?? contractorEmployeeId;
    const today = new Date().toISOString().slice(0, 10);
    await this.notifications.createSystemNotification({
      clientId,
      sourceKey: `contractor-face-mismatch:${contractorEmployeeId}:${reason}:${today}`,
      subject: `Repeated face-attendance failures (contractor): ${label}`,
      message:
        `Contractor employee ${label} has triggered ${n} ${reason} rejections ` +
        `in the last ${REJECTION_ALERT_WINDOW_MIN} minutes today (${today}). ` +
        `Please verify identity and review enrollment.`,
      queryType: 'ATTENDANCE',
      priority: 1,
    });
  }

  /**
   * Phase 4c roadmap #16: device-level rejection alert. Catches the case
   * where an attacker hammers a kiosk with random faces (no employeeCode
   * resolved on the punch payload, so the per-employee helper above
   * never fires). Dedupes per device + reason + hour-of-day bucket so
   * at most one alert per device per reason per hour reaches admins.
   */
  private async maybeAlertRepeatedDeviceFailures(
    clientId: string,
    deviceId: string,
    reason: string,
  ): Promise<void> {
    if (!SUSPICIOUS_REJECTION_REASONS.has(reason)) return;
    const rows: Array<{ n: string }> = await this.faceRepo.manager.query(
      `SELECT COUNT(*)::text AS n
         FROM face_failed_scan_logs
        WHERE client_id = $1
          AND device_id = $2
          AND reason = $3
          AND attempted_at >= now() - ($4 || ' minutes')::interval`,
      [clientId, deviceId, reason, String(REJECTION_ALERT_WINDOW_MIN)],
    );
    const n = Number(rows?.[0]?.n ?? 0);
    if (n < DEVICE_REJECTION_ALERT_THRESHOLD) return;
    // Hour-of-day bucket keeps follow-up bursts within the same hour
    // collapsed into one notification thread.
    const bucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const device = await this.deviceRepo.findOne({
      where: { id: deviceId },
    });
    const label =
      device?.deviceLabel ?? device?.androidId ?? deviceId.slice(0, 8);
    await this.notifications.createSystemNotification({
      clientId,
      branchId: device?.branchId ?? undefined,
      sourceKey: `device-face-rejection:${deviceId}:${reason}:${bucket}`,
      subject: `Suspicious face-attendance activity on device: ${label}`,
      message:
        `Device "${label}" has accumulated ${n} ${reason} rejections in ` +
        `the last ${REJECTION_ALERT_WINDOW_MIN} minutes. This may indicate ` +
        `spoofing attempts, a hardware issue, or a misconfigured kiosk — ` +
        `please review recent activity on this device.`,
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
  if (msg.includes('device-bound') || msg.includes('not found')) return 'OTHER';
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
