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

  /** Employees in scope with no active FaceDesk enrollment. */
  async getPendingEmployees(
    clientId: string,
    branchIds: string[] = [],
  ): Promise<unknown[]> {
    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchIds.length > 0) {
      params.push(branchIds);
      branchFilter = `AND e.branch_id = ANY($${params.length}::uuid[])`;
    }
    return this.dataSource.query(
      `SELECT e.id AS "employeeId", e.employee_code AS "employeeCode",
              e.name AS "name", e.branch_id AS "branchId",
              e.department AS "department", e.designation AS "designation",
              COALESCE(p.enrollment_status, 'PENDING') AS "enrollmentStatus"
         FROM employees e
         LEFT JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.client_id = e.client_id
        WHERE e.client_id = $1
          AND e.is_active = true
          AND (p.enrollment_status IS NULL OR p.enrollment_status <> 'ENROLLED')
          ${branchFilter}
        ORDER BY e.employee_code ASC`,
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

    return {
      ok: true,
      profileId: saved.profileId,
      samples: bestSamples.length,
      message: 'Enrollment saved',
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
  ): Promise<{ employeeId: string; employeeCode: string; pin: string }> {
    let employeeId = (target.employeeId ?? '').trim();
    if (!employeeId && target.employeeCode) {
      const [emp] = await this.dataSource.query(
        `SELECT id FROM employees WHERE client_id = $1 AND employee_code = $2 LIMIT 1`,
        [clientId, target.employeeCode.trim()],
      );
      if (!emp) throw new NotFoundException('Employee code not found');
      employeeId = emp.id;
    }
    if (!employeeId) {
      throw new BadRequestException('employeeId or employeeCode is required');
    }
    const profile = await this.profileRepo.findOne({
      where: { employeeId, clientId },
    });
    if (!profile || profile.enrollmentStatus !== 'ENROLLED') {
      throw new BadRequestException(
        'Employee must be face-enrolled before a PIN can be set',
      );
    }
    const [emp] = await this.dataSource.query(
      `SELECT employee_code AS "employeeCode" FROM employees WHERE id = $1 AND client_id = $2 LIMIT 1`,
      [employeeId, clientId],
    );
    let pin = (explicitPin ?? '').trim();
    if (pin) {
      if (!/^\d{4,6}$/.test(pin)) {
        throw new BadRequestException('PIN must be 4–6 digits');
      }
    } else {
      pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    }
    profile.attendancePinHash = await bcrypt.hash(pin, 10);
    profile.attendancePinSetAt = new Date();
    await this.profileRepo.save(profile);
    await this.audit(clientId, actorId, 'SET_ATTENDANCE_PIN', employeeId, {});
    return { employeeId, employeeCode: emp?.employeeCode ?? '', pin };
  }
}
