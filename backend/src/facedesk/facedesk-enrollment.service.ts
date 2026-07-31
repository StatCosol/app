import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  averageEmbeddings,
  bufferToEmbedding,
  embeddingToBuffer,
} from '../mobile-attendance/face/face-math';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import {
  FaceDeskAuditEntity,
  FaceDeskDuplicateAlertEntity,
  FaceDeskProfileEntity,
  FaceDeskReviewQueueEntity,
  FaceDeskSampleEntity,
} from './entities/facedesk.entities';
import { FaceDeskFaceService, ResolvedFrame } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { pinLookupHash } from './facedesk-pin.util';
import { CheckDuplicateDto, SaveEnrollmentDto } from './facedesk.dto';

export interface DuplicateHit {
  matchedEmployeeId: string;
  score: number;
}

@Injectable()
export class FaceDeskEnrollmentService {
  constructor(
    @InjectRepository(FaceDeskProfileEntity)
    private readonly profileRepo: Repository<FaceDeskProfileEntity>,
    @InjectRepository(FaceDeskSampleEntity)
    private readonly sampleRepo: Repository<FaceDeskSampleEntity>,
    @InjectRepository(FaceDeskDuplicateAlertEntity)
    private readonly dupeRepo: Repository<FaceDeskDuplicateAlertEntity>,
    @InjectRepository(FaceDeskReviewQueueEntity)
    private readonly reviewRepo: Repository<FaceDeskReviewQueueEntity>,
    @InjectRepository(FaceDeskAuditEntity)
    private readonly auditRepo: Repository<FaceDeskAuditEntity>,
    private readonly faceService: FaceDeskFaceService,
    private readonly settings: FaceDeskSettingsService,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly dataSource: DataSource,
  ) {}

  private async audit(
    clientId: string,
    actorId: string | null,
    action: string,
    entityId: string | null,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    await this.auditRepo.save({
      clientId,
      actorId,
      action,
      entityType: 'ENROLLMENT',
      entityId,
      detail,
    });
  }

  /**
   * Subjects in scope with no active FaceDesk enrollment. subjectType selects
   * the roster: EMPLOYEE (default) reads `employees`, CONTRACTOR reads
   * `contractor_employees`. The profile join matches on subject_type so an
   * employee and a contractor that happen to share a uuid never cross-match.
   */
  async getPendingEmployees(
    clientId: string,
    branchIds: string[] = [],
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Promise<unknown[]> {
    const params: unknown[] = [clientId];
    const table =
      subjectType === 'CONTRACTOR' ? 'contractor_employees' : 'employees';
    let branchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND e.branch_id = ANY($${params.length}::uuid[])`;
    }
    params.push(subjectType);
    const subjectParam = `$${params.length}`;
    // contractor_employees has no employee_code column in production, so only
    // reference it for the employees roster; contractors are listed/ordered by
    // name (they punch by PIN, not code).
    const isContractor = subjectType === 'CONTRACTOR';
    const codeExpr = isContractor ? 'NULL::text' : 'e.employee_code';
    const orderExpr = isContractor ? 'e.name' : 'e.employee_code';
    return this.dataSource.query(
      `SELECT e.id AS "employeeId", ${codeExpr} AS "employeeCode",
              e.name AS "name", e.branch_id AS "branchId",
              e.department AS "department", e.designation AS "designation",
              '${subjectType}' AS "subjectType",
              COALESCE(p.enrollment_status, 'PENDING') AS "enrollmentStatus"
         FROM ${table} e
         LEFT JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.client_id = e.client_id
          AND p.subject_type = ${subjectParam}
        WHERE e.client_id = $1
          AND e.is_active = true
          AND (p.enrollment_status IS NULL OR p.enrollment_status <> 'ENROLLED')
          ${branchFilter}
        ORDER BY ${orderExpr} ASC`,
      params,
    );
  }

  /**
   * Active subjects with a completed FaceDesk enrollment. Kept separate from
   * the pending query so the admin UI can inspect enrollment health without
   * changing the kiosk ticket workflow.
   */
  async getEnrolledEmployees(
    clientId: string,
    branchIds: string[] | null = null,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Promise<unknown[]> {
    if (branchIds?.length === 0) return [];
    const params: unknown[] = [clientId];
    const table =
      subjectType === 'CONTRACTOR' ? 'contractor_employees' : 'employees';
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND e.branch_id = ANY($${params.length}::uuid[])`;
    }
    params.push(subjectType);
    const subjectParam = `$${params.length}`;
    const isContractor = subjectType === 'CONTRACTOR';
    const codeExpr = isContractor ? 'NULL::text' : 'e.employee_code';
    const orderExpr = isContractor ? 'e.name' : 'e.employee_code';

    return this.dataSource.query(
      `SELECT e.id AS "employeeId", ${codeExpr} AS "employeeCode",
              e.name AS "name", e.branch_id AS "branchId",
              e.department AS "department", e.designation AS "designation",
              p.subject_type AS "subjectType",
              p.enrollment_status AS "enrollmentStatus",
              p.quality_score AS "qualityScore",
              p.liveness_status AS "livenessStatus",
              p.duplicate_status AS "duplicateStatus",
              (p.attendance_pin_hash IS NOT NULL) AS "pinConfigured",
              p.consent_given_at AS "enrolledAt"
         FROM ${table} e
         JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.client_id = e.client_id
          AND p.subject_type = ${subjectParam}
        WHERE e.client_id = $1
          AND e.is_active = true
          AND p.enrollment_status = 'ENROLLED'
          ${branchFilter}
        ORDER BY ${orderExpr} ASC`,
      params,
    );
  }

  async validateQuality(dto: { frames: SaveEnrollmentDto['frames'] }) {
    const resolved = await this.faceService.resolveFrames(dto.frames);
    const good = this.faceService.goodFrames(resolved);
    return {
      ok: good.length > 0,
      totalFrames: resolved.length,
      goodFrames: good.length,
      message:
        good.length > 0
          ? 'OK'
          : this.faceService.simpleQualityMessage(resolved),
    };
  }

  /** Compare a probe embedding against all enrolled faces for the client. */
  async findDuplicate(
    clientId: string,
    probe: Float32Array,
    excludeEmployeeId: string,
    duplicateCosine: number,
  ): Promise<DuplicateHit | null> {
    const rows = await this.dataSource.query<
      Array<{ employee_id: string; face_template: Buffer }>
    >(
      `SELECT employee_id, face_template
         FROM facedesk_employee_face_profiles
        WHERE client_id = $1 AND enrollment_status = 'ENROLLED'
          AND face_template IS NOT NULL AND employee_id <> $2`,
      [clientId, excludeEmployeeId],
    );
    let best: DuplicateHit | null = null;
    for (const r of rows) {
      if (!r.face_template || r.face_template.length === 0) continue;
      const sim = this.faceService.cosine(
        probe,
        bufferToEmbedding(r.face_template),
      );
      if (sim >= duplicateCosine && (!best || sim > best.score)) {
        best = { matchedEmployeeId: r.employee_id, score: sim };
      }
    }
    return best;
  }

  async checkDuplicate(clientId: string, dto: CheckDuplicateDto) {
    const eff = await this.settings.getEffective(clientId);
    const resolved = await this.faceService.resolveFrames(dto.frames);
    const good = this.faceService.goodFrames(resolved);
    if (good.length === 0) {
      return { duplicate: false, message: 'No usable frames' };
    }
    const probe = averageEmbeddings(good.map((f) => f.embedding));
    const hit = await this.findDuplicate(
      clientId,
      probe,
      dto.employeeId,
      eff.duplicateCosine,
    );
    return {
      duplicate: !!hit,
      matchedEmployeeId: hit?.matchedEmployeeId ?? null,
      similarity: hit ? Number(hit.score.toFixed(3)) : null,
      percent: hit ? this.settings.cosineToPercent(hit.score) : null,
    };
  }

  /**
   * Save a face profile: quality gate → liveness → duplicate check → persist
   * profile + min-N samples. Duplicate above threshold blocks and raises an
   * alert for admin review.
   */
  async saveProfile(
    clientId: string,
    branchId: string | null,
    actorId: string,
    dto: SaveEnrollmentDto,
  ) {
    if (!dto.employeeId)
      throw new BadRequestException('employeeId is required');
    if (dto.consentGiven === false) {
      throw new BadRequestException('Consent is required to enroll');
    }
    const eff = await this.settings.getEffective(clientId);

    const resolved = await this.faceService.resolveFrames(dto.frames);
    const good = this.faceService.goodFrames(resolved);
    if (good.length < eff.minFaceSamples) {
      throw new BadRequestException(
        this.faceService.simpleQualityMessage(resolved) +
          ` (need ${eff.minFaceSamples} clear frames, got ${good.length})`,
      );
    }

    if (eff.livenessRequired) {
      const livenessOk =
        dto.livenessPassed === true ||
        good.some((f) => (f.livenessScore ?? 0) >= 0.5);
      if (!livenessOk) {
        throw new BadRequestException('Liveness check failed — please blink');
      }
    }

    const bestSamples = this.faceService.bestFrames(good, eff.minFaceSamples);
    const template = averageEmbeddings(bestSamples.map((f) => f.embedding));
    const model = bestSamples[0]?.model ?? null;

    // Duplicate check — block + alert if the face already belongs to someone.
    const hit = await this.findDuplicate(
      clientId,
      template,
      dto.employeeId,
      eff.duplicateCosine,
    );
    if (hit) {
      const alert = await this.dupeRepo.save({
        clientId,
        newEmployeeId: dto.employeeId,
        matchedEmployeeId: hit.matchedEmployeeId,
        similarityScore: hit.score,
        status: 'PENDING',
      });
      await this.reviewRepo.save({
        clientId,
        branchId,
        employeeId: dto.employeeId,
        issueType: 'DUPLICATE_ENROLLMENT',
        confidenceScore: hit.score,
        status: 'PENDING',
      });
      await this.profileRepo.save(
        this.profileRepo.merge(
          (await this.profileRepo.findOne({
            where: { employeeId: dto.employeeId },
          })) ??
            this.profileRepo.create({ employeeId: dto.employeeId, clientId }),
          {
            clientId,
            branchId,
            subjectType: dto.subjectType ?? 'EMPLOYEE',
            enrollmentStatus: 'BLOCKED',
            duplicateStatus: 'FLAGGED',
          },
        ),
      );
      await this.audit(
        clientId,
        actorId,
        'ENROLL_BLOCKED_DUPLICATE',
        dto.employeeId,
        {
          matchedEmployeeId: hit.matchedEmployeeId,
          similarity: hit.score,
          alertId: alert.alertId,
        },
      );
      throw new ConflictException({
        message: 'Possible duplicate found — sent to admin review',
        matchedEmployeeId: hit.matchedEmployeeId,
        similarity: Number(hit.score.toFixed(3)),
        percent: this.settings.cosineToPercent(hit.score),
      });
    }

    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage
        .uploadPhoto(dto.photoB64, clientId, dto.employeeId)
        .catch(() => null);
    }

    const saved = await this.dataSource.transaction(async (em) => {
      const profileRepo = em.getRepository(FaceDeskProfileEntity);
      const sampleRepo = em.getRepository(FaceDeskSampleEntity);
      const existing = await profileRepo.findOne({
        where: { employeeId: dto.employeeId },
      });
      const profile = await profileRepo.save(
        profileRepo.merge(
          existing ?? profileRepo.create({ employeeId: dto.employeeId }),
          {
            clientId,
            branchId,
            subjectType: dto.subjectType ?? 'EMPLOYEE',
            enrollmentStatus: 'ENROLLED',
            faceTemplate: embeddingToBuffer(template),
            embeddingModel: model,
            qualityScore: this.avgQuality(bestSamples),
            livenessStatus: eff.livenessRequired ? 'PASSED' : 'UNKNOWN',
            duplicateStatus: 'CLEAR',
            consentGivenAt: new Date(),
            consentGivenBy: actorId,
            enrolledBy: actorId,
          },
        ),
      );
      // Replace samples with this session's best N.
      await sampleRepo.delete({ profileId: profile.profileId });
      await sampleRepo.save(
        bestSamples.map((f, i) => ({
          employeeId: dto.employeeId,
          profileId: profile.profileId,
          sampleType: f.sampleType ?? (i === 0 ? 'FRONT' : 'EXPRESSION'),
          imagePath: photoUrl,
          embedding: embeddingToBuffer(f.embedding),
          embeddingModel: f.model,
          qualityScore: f.qualityScore,
        })),
      );
      return profile;
    });

    await this.audit(
      clientId,
      actorId,
      dto.employeeId ? 'ENROLL' : 'ENROLL',
      dto.employeeId,
      { samples: bestSamples.length, model },
    );

    // Auto-issue a unique 4-digit PIN the first time an employee is enrolled, so
    // every enrolled employee can punch immediately without a separate admin
    // step. A re-enrollment keeps the existing PIN.
    let issuedPin: string | null = null;
    if (!saved.attendancePinHash) {
      const { pin, lookup } = await this.generateUniquePin(clientId);
      saved.attendancePinHash = await bcrypt.hash(pin, 10);
      saved.attendancePinLookup = lookup;
      saved.attendancePinSetAt = new Date();
      await this.profileRepo.save(saved);
      await this.audit(clientId, actorId, 'SET_ATTENDANCE_PIN', dto.employeeId, {
        auto: true,
      });
      issuedPin = pin;
    }

    return {
      ok: true,
      profileId: saved.profileId,
      samples: bestSamples.length,
      pin: issuedPin,
      message: issuedPin
        ? `Enrolled. Attendance PIN: ${issuedPin}`
        : 'Enrollment saved',
    };
  }

  async reEnroll(
    clientId: string,
    branchId: string | null,
    actorId: string,
    dto: SaveEnrollmentDto,
  ) {
    const existing = await this.profileRepo.findOne({
      where: { employeeId: dto.employeeId, clientId },
    });
    if (!existing)
      throw new NotFoundException('No existing profile to re-enroll');
    await this.audit(clientId, actorId, 'RE_ENROLL_START', dto.employeeId, {});
    return this.saveProfile(clientId, branchId, actorId, dto);
  }

  /**
   * Delete a subject's FaceDesk enrollment: removes the face profile (template +
   * PIN) and every stored sample so the subject returns to "pending" and can be
   * re-enrolled cleanly. Attendance history (logs / contractor punches) is keyed
   * by employee id, not the profile, so it is preserved. Branch-scoped callers
   * may only delete enrollments within their own branches.
   */
  async deleteEnrollment(
    clientId: string,
    actorId: string,
    employeeId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
    branchIds?: string[] | null,
  ): Promise<{ ok: true }> {
    const profile = await this.profileRepo.findOne({
      where: { employeeId, clientId, subjectType },
    });
    if (!profile) {
      throw new NotFoundException('No enrollment found for this subject');
    }
    if (
      branchIds &&
      branchIds.length > 0 &&
      profile.branchId &&
      !branchIds.includes(profile.branchId)
    ) {
      throw new NotFoundException('Enrollment is not in your branch scope');
    }
    // Samples reference the profile, so remove them first, then the profile.
    await this.sampleRepo.delete({ profileId: profile.profileId });
    await this.profileRepo.delete({ profileId: profile.profileId });
    await this.audit(clientId, actorId, 'ENROLLMENT_DELETED', employeeId, {
      subjectType,
      profileId: profile.profileId,
    });
    return { ok: true };
  }

  private avgQuality(frames: ResolvedFrame[]): number {
    if (!frames.length) return 0;
    return (
      frames.reduce((s, f) => s + (f.qualityScore || 0), 0) / frames.length
    );
  }

  /**
   * Set (or reset) an employee's attendance PIN for PIN_THEN_FACE mode.
   * The plaintext is returned exactly once so the admin can hand it to the
   * employee; only the bcrypt hash is stored. Requires an enrolled face
   * profile — a PIN is useless without a template to verify against.
   */
  async setAttendancePin(
    clientId: string,
    actorId: string,
    target: { employeeId?: string; employeeCode?: string },
    explicitPin?: string,
    branchIds?: string[],
  ): Promise<{ employeeId: string; employeeCode: string; pin: string }> {
    // Resolve the employee by id or code, scoped to the client and — for a
    // branch-scoped caller — to their permitted branches, so a branch user
    // can't reset another branch's employee credential.
    const params: unknown[] = [clientId];
    const conds: string[] = ['client_id = $1'];
    if (target.employeeId?.trim()) {
      params.push(target.employeeId.trim());
      conds.push(`id = $${params.length}`);
    } else if (target.employeeCode?.trim()) {
      params.push(target.employeeCode.trim());
      conds.push(`employee_code = $${params.length}`);
    } else {
      throw new BadRequestException('employeeId or employeeCode is required');
    }
    if (branchIds && branchIds.length > 0) {
      params.push(branchIds);
      conds.push(`branch_id = ANY($${params.length}::uuid[])`);
    }
    const [emp] = await this.dataSource.query(
      `SELECT id, employee_code AS "employeeCode"
         FROM employees WHERE ${conds.join(' AND ')} LIMIT 1`,
      params,
    );
    if (!emp) throw new NotFoundException('Employee not found in your scope');
    const employeeId: string = emp.id;

    const profile = await this.profileRepo.findOne({
      where: { employeeId, clientId },
    });
    if (!profile || profile.enrollmentStatus !== 'ENROLLED') {
      throw new BadRequestException(
        'Employee must be face-enrolled before a PIN can be set',
      );
    }
    const explicit = (explicitPin ?? '').trim();
    let pin: string;
    let lookup: string;
    if (explicit) {
      // Kiosk workers enter a 4-digit PIN. Accept 4–6 for admins who set one
      // explicitly, but the auto-generated default is 4 digits to match the
      // kiosk keypad and keep entry to a single short code.
      if (!/^\d{4,6}$/.test(explicit)) {
        throw new BadRequestException('PIN must be 4–6 digits');
      }
      pin = explicit;
      lookup = pinLookupHash(clientId, pin);
      if (await this.pinTakenByOther(clientId, lookup, employeeId)) {
        throw new ConflictException(
          'That PIN is already in use — choose a different one',
        );
      }
    } else {
      ({ pin, lookup } = await this.generateUniquePin(clientId));
    }
    profile.attendancePinHash = await bcrypt.hash(pin, 10);
    profile.attendancePinLookup = lookup;
    profile.attendancePinSetAt = new Date();
    await this.profileRepo.save(profile);
    await this.audit(clientId, actorId, 'SET_ATTENDANCE_PIN', employeeId, {});
    return { employeeId, employeeCode: emp?.employeeCode ?? '', pin };
  }

  /** True if another employee in the client already holds this PIN lookup. */
  private async pinTakenByOther(
    clientId: string,
    lookup: string,
    employeeId: string,
  ): Promise<boolean> {
    const existing = await this.profileRepo.findOne({
      where: { clientId, attendancePinLookup: lookup },
      select: ['employeeId'],
    });
    return !!existing && existing.employeeId !== employeeId;
  }

  /**
   * Generate a random 4-digit PIN that no other employee in the client holds.
   * The unique index is the real guarantee; this just avoids a save that would
   * hit it. Retries a bounded number of times before giving up (only realistic
   * once a client approaches ~10k enrolled employees).
   */
  private async generateUniquePin(
    clientId: string,
  ): Promise<{ pin: string; lookup: string }> {
    for (let i = 0; i < 40; i++) {
      const pin = String(randomInt(0, 10_000)).padStart(4, '0');
      const lookup = pinLookupHash(clientId, pin);
      const clash = await this.profileRepo.findOne({
        where: { clientId, attendancePinLookup: lookup },
        select: ['employeeId'],
      });
      if (!clash) return { pin, lookup };
    }
    throw new ConflictException(
      'Could not allocate a unique PIN — the 4-digit space for this client is exhausted',
    );
  }
}
