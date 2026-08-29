import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
  normalizeEmbeddingModel,
} from '../mobile-attendance/face/face-math';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import {
  FaceDeskAuditEntity,
  FaceDeskDuplicateAlertEntity,
  FaceDeskProfileEntity,
  FaceDeskReviewQueueEntity,
  FaceDeskSampleEntity,
} from './entities/facedesk.entities';
import {
  FaceDeskFaceService,
  ENROLL_MIN_FRAME_QUALITY,
  ResolvedFrame,
} from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';
import { pinLookupHash } from './facedesk-pin.util';
import { CheckDuplicateDto, SaveEnrollmentDto } from './facedesk.dto';

export interface DuplicateHit {
  matchedEmployeeId: string;
  score: number;
  source: 'cosine' | 'azure';
  margin?: number;
  /** A duplicate candidate always blocks enrollment until an administrator
   *  resolves its alert. */
  blocking: boolean;
}

@Injectable()
export class FaceDeskEnrollmentService {
  private readonly logger = new Logger(FaceDeskEnrollmentService.name);

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
    private readonly azureFace: FaceDeskAzureFaceService,
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
              p.consent_given_at AS "enrolledAt",
              EXISTS (
                SELECT 1
                  FROM facedesk_employee_face_samples s
                 WHERE s.profile_id = p.profile_id
                   AND s.image_path IS NOT NULL
              ) AS "hasEnrolledPhoto"
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

  /** Branch-verifier only: stream the best enrolled reference sample for a subject. */
  async getEnrolledReferencePhoto(
    clientId: string,
    employeeId: string,
    branchIds: string[],
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE',
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!branchIds.length) {
      throw new NotFoundException('Enrollment not found');
    }
    const table =
      subjectType === 'CONTRACTOR' ? 'contractor_employees' : 'employees';
    const [row] = await this.dataSource.query(
      `SELECT e.branch_id AS "branchId",
              (SELECT s.image_path
                 FROM facedesk_employee_face_profiles p
                 JOIN facedesk_employee_face_samples s
                   ON s.profile_id = p.profile_id
                WHERE p.client_id = e.client_id
                  AND p.employee_id = e.id
                  AND p.subject_type = $3
                  AND s.image_path IS NOT NULL
                ORDER BY (s.sample_type = 'FRONT') DESC,
                         s.quality_score DESC NULLS LAST,
                         s.created_at DESC
                LIMIT 1) AS "photoUrl"
         FROM ${table} e
         JOIN facedesk_employee_face_profiles p
           ON p.employee_id = e.id AND p.client_id = e.client_id
          AND p.subject_type = $3
        WHERE e.client_id = $1
          AND e.id = $2
          AND p.enrollment_status = 'ENROLLED'
        LIMIT 1`,
      [clientId, employeeId, subjectType],
    );
    if (!row?.photoUrl) return null;
    if (!row.branchId || !branchIds.includes(row.branchId)) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.photoStorage.readPhoto(row.photoUrl);
  }

  async validateQuality(dto: { frames: SaveEnrollmentDto['frames'] }) {
    const { resolved, good } = await this.resolveEnrollmentFrames(dto.frames);
    const frontGood = good.filter((f) => f.sampleType === 'FRONT');
    return {
      ok: good.length > 0 && frontGood.length >= 1,
      totalFrames: resolved.length,
      goodFrames: good.length,
      frontFrames: frontGood.length,
      message:
        good.length > 0 && frontGood.length >= 1
          ? 'OK'
          : this.faceService.simpleQualityMessage(resolved),
    };
  }

  /** Pick the representative frame and store it, returning its path. Shared by
   *  the enrolled and blocked paths so a held capture keeps its photo too —
   *  the admin reviewing a duplicate alert needs a face to look at. */
  private pickRepresentativePhoto(dto: SaveEnrollmentDto): string | null {
    return (
      dto.photoB64 ??
      dto.frames?.find((f) => f.sampleType === 'FRONT' && f.photoB64)
        ?.photoB64 ??
      dto.frames?.find((f) => f.photoB64)?.photoB64 ??
      null
    );
  }

  private async uploadRepresentativePhoto(
    clientId: string,
    dto: SaveEnrollmentDto,
  ): Promise<string | null> {
    const photoB64 = this.pickRepresentativePhoto(dto);
    if (!photoB64) return null;
    return this.photoStorage
      .uploadPhoto(photoB64, clientId, dto.employeeId)
      .catch(() => null);
  }

  /**
   * Compare a probe embedding against all enrolled faces for the client.
   * Scans every branch (client-wide), so the same face enrolled at a second
   * branch is caught. `reviewCosine` is the conservative lower duplicate
   * floor, so low-quality captures of the same person still require review.
   */
  async findDuplicate(
    clientId: string,
    probe: Float32Array,
    excludeEmployeeId: string,
    duplicateCosine: number,
    reviewCosine?: number,
    probeModel?: string | null,
  ): Promise<DuplicateHit | null> {
    const rows = await this.dataSource.query<
      Array<{
        employee_id: string;
        face_template: Buffer | null;
        profile_model: string | null;
        sample_embedding: Buffer | null;
        sample_model: string | null;
      }>
    >(
      `SELECT p.employee_id,
              p.face_template,
              p.embedding_model AS profile_model,
              s.embedding AS sample_embedding,
              s.embedding_model AS sample_model
         FROM facedesk_employee_face_profiles p
         LEFT JOIN facedesk_employee_face_samples s
           ON s.profile_id = p.profile_id
        WHERE p.client_id = $1
          AND p.enrollment_status = 'ENROLLED'
          AND p.employee_id <> $2
          AND (p.face_template IS NOT NULL OR s.embedding IS NOT NULL)`,
      [clientId, excludeEmployeeId],
    );

    // Only compare embeddings from the SAME model. cosineSim returns -1 on a
    // dimension mismatch, so a gallery entry from a different model silently
    // scored as "completely different" and the duplicate became invisible —
    // exactly how one face got enrolled against two people. Track what we could
    // not compare so a stale gallery is visible instead of looking clean.
    const bestByEmployee = new Map<string, number>();
    let skippedIncomparable = 0;
    const compare = (
      buf: Buffer | null,
      model: string | null,
    ): number | null => {
      if (!buf?.length) return null;
      const candidate = bufferToEmbedding(buf);
      if (candidate.length !== probe.length) {
        skippedIncomparable++;
        return null;
      }
      if (
        probeModel &&
        model &&
        normalizeEmbeddingModel(model) !== normalizeEmbeddingModel(probeModel)
      ) {
        skippedIncomparable++;
        return null;
      }
      return this.faceService.cosine(probe, candidate);
    };

    for (const r of rows) {
      let maxSim = bestByEmployee.get(r.employee_id) ?? -1;
      const t = compare(r.face_template, r.profile_model);
      if (t !== null) maxSim = Math.max(maxSim, t);
      const s = compare(r.sample_embedding, r.sample_model);
      if (s !== null) maxSim = Math.max(maxSim, s);
      if (maxSim >= 0) bestByEmployee.set(r.employee_id, maxSim);
    }
    if (skippedIncomparable > 0) {
      this.logger.warn(
        `duplicate scan skipped ${skippedIncomparable} gallery entries not comparable with the probe model (${
          probeModel ?? 'unknown'
        }) — those subjects need re-enrollment to be duplicate-checked`,
      );
    }

    const ranked = [...bestByEmployee.entries()].sort((a, b) => b[1] - a[1]);
    // Anything below the review band is genuinely a different face.
    const floor = Math.min(duplicateCosine, reviewCosine ?? duplicateCosine);

    // Always record the outcome. A silent null is indistinguishable between
    // "nobody comparable to compare against" and "compared everyone and they
    // genuinely differ" — and telling those apart is the whole diagnosis when
    // a duplicate slips through. Cheap: one line per enrollment.
    this.logger.log(
      `duplicate scan: gallery=${bestByEmployee.size} comparable subject(s), ` +
        `top=${ranked.length ? ranked[0][1].toFixed(3) : 'n/a'} ` +
        `(subject ${ranked.length ? ranked[0][0] : 'n/a'}), ` +
        `block>=${duplicateCosine.toFixed(3)} review>=${floor.toFixed(3)}, ` +
        `probeModel=${probeModel ?? 'unknown'} dim=${probe.length}, ` +
        `skipped=${skippedIncomparable} → ${
          ranked.length && ranked[0][1] >= floor ? 'HIT' : 'no duplicate'
        }`,
    );

    if (!ranked.length || ranked[0][1] < floor) return null;

    // NOTE: the margin between the top two candidates is reported but must NOT
    // veto the hit. Margin logic belongs to 1:N *identification* ("which person
    // is this?"), where two close candidates mean we cannot tell them apart.
    // For duplicate detection the question is "does this face already exist?" —
    // and matching two enrolled profiles almost equally well is *stronger*
    // evidence of duplication, not weaker. Vetoing on a small margin made the
    // check go permanently blind to anyone already enrolled twice, since their
    // two profiles score near-identically and cancel each other out.
    const margin = ranked.length > 1 ? ranked[0][1] - ranked[1][1] : 1;

    return {
      matchedEmployeeId: ranked[0][0],
      score: ranked[0][1],
      source: 'cosine',
      margin,
      // Never auto-enroll a candidate inside the duplicate review band. A
      // false positive can be approved by an administrator; a false negative
      // permanently gives one face more than one employee identity.
      blocking: true,
    };
  }

  /** Azure-first duplicate check; falls back to cosine when unavailable. */
  private async resolveDuplicateHit(
    clientId: string,
    dto: { employeeId: string; frames?: Array<{ photoB64?: string }> },
    probe: Float32Array,
    duplicateCosine: number,
    reviewCosine?: number,
    probeModel?: string | null,
  ): Promise<DuplicateHit | null> {
    const photoB64 = dto.frames?.find((f) => f.photoB64)?.photoB64 ?? null;
    if (photoB64) {
      const azureHit = await this.azureFace.findDuplicate(
        clientId,
        photoB64,
        dto.employeeId,
      );
      if (azureHit) {
        return {
          matchedEmployeeId: azureHit.matchedEmployeeId,
          score: azureHit.confidence,
          source: 'azure',
          // Azure only returns a hit once it is already confident.
          blocking: true,
        };
      }
    }
    return this.findDuplicate(
      clientId,
      probe,
      dto.employeeId,
      duplicateCosine,
      reviewCosine,
      probeModel,
    );
  }

  /**
   * A duplicate clearance permits one specific employee-to-face pairing to be
   * enrolled after human review. Requiring both the profile state and the
   * cleared alert prevents that approval from becoming a blanket bypass for
   * future matches against different people.
   */
  private async hasApprovedDuplicateClearance(
    clientId: string,
    employeeId: string,
    matchedEmployeeId: string,
  ): Promise<boolean> {
    const profile = await this.profileRepo.findOne({
      where: { clientId, employeeId },
    });
    if (profile?.duplicateStatus !== 'APPROVED') return false;

    const clearance = await this.dupeRepo.findOne({
      where: [
        {
          clientId,
          newEmployeeId: employeeId,
          matchedEmployeeId,
          detectionBand: 'BLOCK',
          status: 'APPROVED',
        },
        {
          clientId,
          newEmployeeId: employeeId,
          matchedEmployeeId,
          detectionBand: 'BLOCK',
          status: 'FALSE_ALERT',
        },
      ],
    });
    return !!clearance;
  }

  async checkDuplicate(clientId: string, dto: CheckDuplicateDto) {
    const eff = await this.settings.getEffective(clientId);
    const { good } = await this.resolveEnrollmentFrames(dto.frames);
    if (good.length === 0) {
      return { duplicate: false, message: 'No usable frames' };
    }
    const bestSamples = this.faceService.bestFrames(good, eff.minFaceSamples);
    const probe = averageEmbeddings(bestSamples.map((f) => f.embedding));
    const hit = await this.resolveDuplicateHit(
      clientId,
      dto,
      probe,
      eff.duplicateCosine,
      eff.duplicateReviewCosine,
      bestSamples[0]?.model ?? null,
    );
    const approvedOverride =
      !!hit &&
      (await this.hasApprovedDuplicateClearance(
        clientId,
        dto.employeeId,
        hit.matchedEmployeeId,
      ));
    return {
      duplicate: !!hit && !approvedOverride,
      needsReview: false,
      approvedOverride,
      matchedEmployeeId: hit?.matchedEmployeeId ?? null,
      similarity: hit ? Number(hit.score.toFixed(3)) : null,
      percent: hit ? this.settings.cosineToPercent(hit.score) : null,
    };
  }

  private async resolveEnrollmentBranch(
    clientId: string,
    employeeId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    requestedBranchId: string | null,
    allowedBranchIds: string[] | null,
  ): Promise<string | null> {
    const table =
      subjectType === 'CONTRACTOR' ? 'contractor_employees' : 'employees';
    const [subject] = await this.dataSource.query<
      Array<{ branchId: string | null }>
    >(
      `SELECT branch_id AS "branchId" FROM ${table}
        WHERE id = $1 AND client_id = $2 AND is_active = true LIMIT 1`,
      [employeeId, clientId],
    );
    if (!subject) {
      throw new NotFoundException('Employee not found in your scope');
    }

    const branchId = subject.branchId ?? null;
    if (
      (requestedBranchId !== null && branchId !== requestedBranchId) ||
      (allowedBranchIds !== null &&
        (!branchId || !allowedBranchIds.includes(branchId)))
    ) {
      throw new NotFoundException('Employee not found in your scope');
    }
    return branchId;
  }

  /**
   * Save a face profile: quality gate → liveness → duplicate check → persist
   * profile + min-N samples. Duplicate above threshold blocks and raises an
   * alert for admin review.
   */
  async saveProfile(
    clientId: string,
    requestedBranchId: string | null,
    actorId: string,
    dto: SaveEnrollmentDto,
    allowedBranchIds: string[] | null = null,
  ) {
    if (!dto.employeeId)
      throw new BadRequestException('employeeId is required');
    if (dto.consentGiven === false) {
      throw new BadRequestException('Consent is required to enroll');
    }
    const subjectType = dto.subjectType ?? 'EMPLOYEE';
    const branchId = await this.resolveEnrollmentBranch(
      clientId,
      dto.employeeId,
      subjectType,
      requestedBranchId,
      allowedBranchIds,
    );
    const eff = await this.settings.getEffective(clientId);

    const { good } = await this.resolveEnrollmentFrames(dto.frames);
    const bestSamples = this.faceService.bestFrames(good, eff.minFaceSamples);
    // The selected model group, not the combined capture, must independently
    // meet the enrollment gate. Frames discarded for using another embedding
    // model cannot satisfy the sample or front-facing requirements.
    this.assertEnrollmentFrames(bestSamples, bestSamples, eff.minFaceSamples);

    if (eff.livenessRequired) {
      const livenessOk =
        dto.livenessPassed === true ||
        bestSamples.some((f) => (f.livenessScore ?? 0) >= 0.5);
      if (!livenessOk) {
        throw new BadRequestException('Liveness check failed — please blink');
      }
    }

    const template = averageEmbeddings(bestSamples.map((f) => f.embedding));
    const model = bestSamples[0]?.model ?? null;

    // Duplicate check — every match in the conservative review band blocks
    // enrollment and requires an explicit admin decision.
    const hit = await this.resolveDuplicateHit(
      clientId,
      dto,
      template,
      eff.duplicateCosine,
      eff.duplicateReviewCosine,
      model,
    );
    const approvedOverride =
      !!hit &&
      (await this.hasApprovedDuplicateClearance(
        clientId,
        dto.employeeId,
        hit.matchedEmployeeId,
      ));
    if (hit && !approvedOverride) {
      // Keep this capture rather than discarding it. The admin reviewing the
      // alert is deciding whether this face may enrol — if they approve, the
      // worker should simply BE enrolled, not be sent back to the kiosk to
      // stand in front of the camera again. The template is held against a
      // BLOCKED profile, so it cannot match a punch until approval flips it to
      // ENROLLED, and a rejection deletes it (see actOnDuplicate).
      const photoUrl = await this.uploadRepresentativePhoto(clientId, dto);
      await this.dataSource.transaction(async (em) => {
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
              subjectType,
              enrollmentStatus: 'BLOCKED',
              duplicateStatus: 'FLAGGED',
              faceTemplate: embeddingToBuffer(template),
              embeddingModel: model,
              qualityScore: this.avgQuality(bestSamples),
              livenessStatus: eff.livenessRequired ? 'PASSED' : 'UNKNOWN',
              consentGivenAt: new Date(),
              consentGivenBy: actorId,
              enrolledBy: actorId,
            },
          ),
        );
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
      });

      const alert = await this.dupeRepo.save({
        clientId,
        newEmployeeId: dto.employeeId,
        matchedEmployeeId: hit.matchedEmployeeId,
        similarityScore: hit.score,
        detectionBand: 'BLOCK',
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
      // (profile + samples were already written above, as BLOCKED)
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

    const photoUrl = await this.uploadRepresentativePhoto(clientId, dto);

    const priorProfile = await this.profileRepo.findOne({
      where: { employeeId: dto.employeeId, clientId },
    });
    const priorAzureFaceId = priorProfile?.azurePersistedFaceId ?? null;

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
            subjectType,
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
      await this.audit(
        clientId,
        actorId,
        'SET_ATTENDANCE_PIN',
        dto.employeeId,
        {
          auto: true,
        },
      );
      issuedPin = pin;
    }

    const representativePhotoB64 = this.pickRepresentativePhoto(dto);
    if (representativePhotoB64) {
      const azureFaceId = await this.azureFace.registerEnrollmentFace(
        clientId,
        dto.employeeId,
        representativePhotoB64,
        priorAzureFaceId,
      );
      if (azureFaceId && azureFaceId !== saved.azurePersistedFaceId) {
        saved.azurePersistedFaceId = azureFaceId;
        await this.profileRepo.save(saved);
      }
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
    requestedBranchId: string | null,
    actorId: string,
    dto: SaveEnrollmentDto,
    allowedBranchIds: string[] | null = null,
  ) {
    const existing = await this.profileRepo.findOne({
      where: { employeeId: dto.employeeId, clientId },
    });
    if (!existing)
      throw new NotFoundException('No existing profile to re-enroll');
    await this.audit(clientId, actorId, 'RE_ENROLL_START', dto.employeeId, {});
    return this.saveProfile(
      clientId,
      requestedBranchId,
      actorId,
      dto,
      allowedBranchIds,
    );
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

    // Branch scope: authorize against the subject's CURRENT roster branch, not
    // the profile's stored branch. A profile enrolled by a client-wide admin has
    // a null branch, and a transferred worker's profile branch goes stale — both
    // would otherwise let a branch user delete outside their scope (or be denied
    // in their own). A non-null branchIds means a branch-scoped caller, so the
    // subject's live branch must be one of theirs.
    if (branchIds != null) {
      const table =
        subjectType === 'CONTRACTOR' ? 'contractor_employees' : 'employees';
      const [row] = await this.dataSource.query<
        Array<{ branchId: string | null }>
      >(
        `SELECT branch_id AS "branchId" FROM ${table}
          WHERE id = $1 AND client_id = $2 LIMIT 1`,
        [employeeId, clientId],
      );
      const currentBranch = row?.branchId ?? null;
      if (!currentBranch || !branchIds.includes(currentBranch)) {
        throw new NotFoundException('Enrollment is not in your branch scope');
      }
    }

    // Capture stored photo URLs before the sample rows (which hold them) go.
    const samples = await this.sampleRepo.find({
      where: { profileId: profile.profileId },
    });
    const photoUrls = samples
      .map((s) => s.imagePath)
      .filter((p): p is string => !!p);

    await this.azureFace.removeEnrollmentFace(
      clientId,
      profile.azurePersistedFaceId,
    );

    // Atomic: samples, profile and the audit row commit together or not at all,
    // so a partial failure can't leave a profile with its samples gone, or an
    // irreversible delete with no audit trail.
    await this.dataSource.transaction(async (em) => {
      await em.delete(FaceDeskSampleEntity, { profileId: profile.profileId });
      await em.delete(FaceDeskProfileEntity, { profileId: profile.profileId });
      await em.getRepository(FaceDeskAuditEntity).save({
        clientId,
        actorId,
        action: 'ENROLLMENT_DELETED',
        entityType: 'ENROLLMENT',
        entityId: employeeId,
        detail: { subjectType, profileId: profile.profileId },
      });
    });

    // Best-effort orphan cleanup once the DB state is committed — a storage
    // hiccup must not fail an already-completed deletion.
    for (const url of photoUrls) {
      await this.photoStorage.deletePhoto(url).catch(() => undefined);
    }
    return { ok: true };
  }

  /** Enrollment uses strict face-svc validation and a higher quality bar. */
  private async resolveEnrollmentFrames(
    frames: SaveEnrollmentDto['frames'],
  ): Promise<{ resolved: ResolvedFrame[]; good: ResolvedFrame[] }> {
    const resolved = await this.faceService.resolveFrames(frames, {
      strictQuality: true,
    });
    const good = this.faceService.goodFrames(
      resolved,
      ENROLL_MIN_FRAME_QUALITY,
    );
    return { resolved, good };
  }

  private assertEnrollmentFrames(
    resolved: ResolvedFrame[],
    good: ResolvedFrame[],
    minFaceSamples: number,
  ): void {
    const minFront = Math.min(3, minFaceSamples);
    const frontGood = good.filter((f) => f.sampleType === 'FRONT');
    if (frontGood.length < minFront) {
      throw new BadRequestException(
        'Look straight at the camera and hold still — clear front-facing frames are required before head turns. ' +
          this.faceService.simpleQualityMessage(resolved),
      );
    }
    if (good.length < minFaceSamples) {
      throw new BadRequestException(
        this.faceService.simpleQualityMessage(resolved) +
          ` (need ${minFaceSamples} clear frames, got ${good.length})`,
      );
    }
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
    branchIds: string[] | null = null,
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
    if (branchIds?.length === 0) {
      throw new NotFoundException('Employee not found in your scope');
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
