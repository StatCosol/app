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
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { FaceEnrollmentEntity } from './entities/face-enrollment.entity';
import { FaceEmbeddingClient } from './face-embedding.client';
import {
  MobileAttendanceDeviceEntity,
  MobileDeviceMode,
} from './entities/mobile-attendance-device.entity';
import {
  EnrollFaceDto,
  EnrollSelfDto,
  MobilePunchDto,
  RegisterMobileDeviceDto,
} from './mobile-attendance.dto';

const MIN_MATCH_SCORE = 0.70; // mapped (cos+1)/2 threshold for MobileFaceNet (raw cos ~0.40); was 0.78 (raw cos 0.56) — too strict without face alignment
const MIN_LIVENESS_SCORE = 0.5;
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
    @InjectRepository(MobileAttendanceDeviceEntity)
    private readonly deviceRepo: Repository<MobileAttendanceDeviceEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly biometricService: BiometricService,
    private readonly faceEmbeddingClient: FaceEmbeddingClient,
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

    // TODO(face-photo-blob): upload `body.photoBase64` to Azure Blob
    //   (container `face-photos`, key `{clientId}/{employeeId}.jpg`) and store
    //   the resulting URL here. For now we keep a tiny inline thumbnail
    //   reference so audits still see *something*; full photo is dropped.
    const photoUrl = body.photoBase64
      ? `embedded:mobilefacenet/${embedding ? embedding.length : 0}b`
      : null;

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
      return (await this.faceRepo.findOne({ where: { employeeId: emp.id } }))!;
    }
    return this.faceRepo.save(this.faceRepo.create(payload));
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

    const now = new Date();
    const payload: Partial<FaceEnrollmentEntity> = {
      employeeId: emp.id,
      clientId: device.clientId,
      branchId: emp.branchId ?? device.branchId ?? null,
      embedding,
      embeddingModel: body.embeddingModel ?? 'mobilefacenet-v1',
      photoUrl: body.photoBase64
        ? `data:image/jpeg;base64,${body.photoBase64.slice(0, 64)}...`
        : null,
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
    return this.faceRepo.save(row);
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
      throw new ConflictException(
        `This face already appears to be enrolled for employee ${label} ` +
          `(similarity ${bestScore.toFixed(2)}). Each face may only be ` +
          `registered to one employee. Deactivate the other enrollment first ` +
          `if this is genuinely the same person.`,
      );
    }
  }

  // ------------------------------------------------------------------ punch
  async recordPunch(
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

    // Quality gates — reject low confidence / liveness
    if (body.matchScore != null && body.matchScore < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `Face match score ${body.matchScore.toFixed(2)} below threshold ${MIN_MATCH_SCORE}`,
      );
    }
    if (body.livenessScore != null && body.livenessScore < MIN_LIVENESS_SCORE) {
      throw new BadRequestException('Liveness check failed');
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
        body.photoB64 ? null : null, // photo upload to blob is a separate task
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
