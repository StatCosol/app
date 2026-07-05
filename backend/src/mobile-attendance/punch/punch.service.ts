import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MobileAttendanceDeviceEntity } from '../devices/device.entity';
import { FaceEnrollmentEntity } from '../enrollment/face-enrollment.entity';
import { ContractorFaceEnrollmentEntity } from '../enrollment/contractor-face-enrollment.entity';
import { FaceEnrollmentTemplateEntity } from '../enrollment/face-enrollment-template.entity';
import { MobileAttendancePunchEntity } from './punch.entity';
import { ContractorBiometricPunchEntity } from './contractor-punch.entity';
import { LivenessService } from '../liveness/liveness.service';
import { FacePhotoStorageService } from '../face/face-photo-storage.service';
import {
  FaceEmbeddingClient,
  FaceQualityError,
} from '../face/face-embedding.client';
import { FaceTemplateService } from '../face/face-template.service';
import { BiometricService } from '../../biometric/biometric.service';
import {
  bufferToEmbedding,
  cosineSim,
  decodeEmbedding,
  normalizeEmbeddingModel,
  toMatchScore,
} from '../face/face-math';
import { RecordPunchDto } from './punch.dto';

// MobileFaceNet real-world same-person cosine similarity is ~0.70–0.87; 0.90 was unreachable.
const MIN_MATCH_SCORE = Number(process.env.FACE_MIN_MATCH_SCORE ?? 0.84);
const MIN_SINGLE_GALLERY_MATCH_SCORE = Number(
  process.env.FACE_SINGLE_GALLERY_MIN_MATCH_SCORE ??
    Math.max(MIN_MATCH_SCORE, 0.84),
);
const MIN_MATCH_MARGIN = Number(process.env.FACE_MIN_MATCH_MARGIN ?? 0.08);
// Two-level decision: borderline scores land in a review queue instead of a
// hard reject. Review band = [REVIEW_MIN_SCORE, auto threshold).
const REVIEW_ENABLED = process.env.FACE_REVIEW_ENABLED !== 'false';
const REVIEW_MIN_SCORE = Number(process.env.FACE_REVIEW_MIN_SCORE ?? 0.7);
// Passive liveness gate — only enforced when face-svc (or the device) supplies
// a liveness score AND this env/client override is configured.
const MIN_LIVENESS_SCORE = process.env.FACE_MIN_LIVENESS_SCORE
  ? Number(process.env.FACE_MIN_LIVENESS_SCORE)
  : null;
// Prefer server-side re-embedding of the punch photo via face-svc (enables
// ArcFace rollout without a kiosk app update). Device embedding remains the
// fallback when no photo is attached or face-svc is down (fallback mode).
const SERVER_EMBED = process.env.FACE_SERVER_EMBED === 'true';
// Auto-append a fresh template after a very confident match so the gallery
// tracks appearance drift. Disabled unless explicitly configured.
const AUTO_REFRESH_MIN_SCORE = process.env.FACE_AUTO_REFRESH_MIN_SCORE
  ? Number(process.env.FACE_AUTO_REFRESH_MIN_SCORE)
  : null;
// Fresh enrollments become punch-eligible after the kiosk success screen clears.
const ACTIVATION_DELAY_MS =
  Number(process.env.FACE_KIOSK_ACTIVATION_DELAY_SEC ?? 10) * 1000;
const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Minimum gap between punches for the same person — prevents double-punch from retries or rapid re-scan.
const PUNCH_COOLDOWN_MS =
  Number(process.env.FACE_PUNCH_COOLDOWN_SEC ?? 30) * 1000;
const BUSINESS_TZ_OFFSET_MIN = 330;

// Decisions that count as real attendance (cooldown, direction, day-complete).
const COUNTED_DECISIONS = `('AUTO','REVIEW_APPROVED')`;

export interface RosterEntry {
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  subjectId: string;
  displayName: string;
  employeeCode?: string;
  embeddingModel: string | null;
  enrolledAt: Date;
  embedding: Float32Array;
}

export interface PunchResult {
  ok: true;
  review?: boolean;
  message?: string;
  employeeName?: string;
  employeeCode?: string;
  direction?: string;
  punchTime?: string;
}

interface ClientFaceThresholds {
  autoAccept: number;
  reviewMin: number;
  minMargin: number;
  minLiveness: number | null;
}

@Injectable()
export class PunchService {
  private readonly logger = new Logger(PunchService.name);

  constructor(
    @InjectRepository(FaceEnrollmentEntity)
    private readonly enrollRepo: Repository<FaceEnrollmentEntity>,
    @InjectRepository(ContractorFaceEnrollmentEntity)
    private readonly contractorEnrollRepo: Repository<ContractorFaceEnrollmentEntity>,
    @InjectRepository(FaceEnrollmentTemplateEntity)
    private readonly templateRepo: Repository<FaceEnrollmentTemplateEntity>,
    @InjectRepository(MobileAttendancePunchEntity)
    private readonly punchRepo: Repository<MobileAttendancePunchEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    private readonly livenessService: LivenessService,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly faceClient: FaceEmbeddingClient,
    private readonly templateService: FaceTemplateService,
    private readonly biometricService: BiometricService,
    private readonly dataSource: DataSource,
  ) {}

  async getRoster(
    device: MobileAttendanceDeviceEntity,
  ): Promise<RosterEntry[]> {
    // Raw SQL so we can JOIN to employees/contractor_employees for display names.
    const empParams: unknown[] = [device.clientId];
    let empBranch = '';
    if (device.branchId) {
      const branchParam = empParams.push(device.branchId);
      // Include subjects with NO branch anywhere: the branch backfill can only
      // align enrollments when the employee has a branch. Unassigned employees
      // were invisible to every branch kiosk (nothing to match against) —
      // exactly the "already enrolled but not recognized" regression.
      empBranch = `AND (e.branch_id = $${branchParam} OR fe.branch_id = $${branchParam}
          OR (e.branch_id IS NULL AND fe.branch_id IS NULL))`;
    }

    const empRows = await this.dataSource.query<
      Array<{
        employeeId: string;
        name: string;
        employeeCode: string;
        embedding: Buffer;
        embeddingModel: string | null;
        enrolledAt: Date;
      }>
    >(
      `SELECT fe.employee_id   AS "employeeId",
              e.name           AS "name",
              e.employee_code  AS "employeeCode",
              fe.embedding,
              fe.embedding_model AS "embeddingModel",
              fe.enrolled_at   AS "enrolledAt"
         FROM face_enrollments fe
         JOIN employees e
           ON e.id = fe.employee_id
          AND e.client_id = fe.client_id
        WHERE fe.client_id = $1
          AND fe.is_active = true
          AND e.is_active = true
          ${empBranch}`,
      empParams,
    );

    const conParams: unknown[] = [device.clientId];
    let conBranch = '';
    if (device.branchId) {
      const branchParam = conParams.push(device.branchId);
      conBranch = `AND (ce.branch_id = $${branchParam} OR cfe.branch_id = $${branchParam}
          OR (ce.branch_id IS NULL AND cfe.branch_id IS NULL))`;
    }

    const conRows = await this.dataSource.query<
      Array<{
        contractorEmployeeId: string;
        name: string;
        embedding: Buffer;
        embeddingModel: string | null;
        enrolledAt: Date;
      }>
    >(
      `SELECT cfe.contractor_employee_id AS "contractorEmployeeId",
              ce.name                    AS "name",
              cfe.embedding,
              cfe.embedding_model        AS "embeddingModel",
              cfe.enrolled_at            AS "enrolledAt"
         FROM contractor_face_enrollments cfe
         JOIN contractor_employees ce
           ON ce.id = cfe.contractor_employee_id
          AND ce.client_id = cfe.client_id
        WHERE cfe.client_id = $1
          AND cfe.is_active = true
          AND ce.is_active = true
          ${conBranch}`,
      conParams,
    );

    const entries: RosterEntry[] = [];
    const nameBySubject = new Map<
      string,
      { name: string; code?: string; enrolledAt: Date }
    >();

    for (const r of empRows) {
      if (!r.embedding || r.embedding.length === 0) continue;
      nameBySubject.set(`EMPLOYEE:${r.employeeId}`, {
        name: r.name,
        code: r.employeeCode,
        enrolledAt: r.enrolledAt,
      });
      entries.push({
        subjectType: 'EMPLOYEE',
        subjectId: r.employeeId,
        displayName: r.name,
        employeeCode: r.employeeCode,
        embeddingModel: r.embeddingModel,
        enrolledAt: r.enrolledAt,
        embedding: bufferToEmbedding(r.embedding),
      });
    }
    for (const c of conRows) {
      if (!c.embedding || c.embedding.length === 0) continue;
      nameBySubject.set(`CONTRACTOR:${c.contractorEmployeeId}`, {
        name: c.name,
        enrolledAt: c.enrolledAt,
      });
      entries.push({
        subjectType: 'CONTRACTOR',
        subjectId: c.contractorEmployeeId,
        displayName: c.name,
        embeddingModel: c.embeddingModel,
        enrolledAt: c.enrolledAt,
        embedding: bufferToEmbedding(c.embedding),
      });
    }

    // Extra templates (multi-template matching): only for subjects already in
    // the roster, so branch scoping / is_active filtering carries over.
    if (nameBySubject.size > 0) {
      const templates = await this.templateRepo.find({
        where: { clientId: device.clientId },
      });
      for (const t of templates) {
        const key = `${t.subjectType}:${t.subjectId}`;
        const subject = nameBySubject.get(key);
        if (!subject) continue;
        if (!t.embedding || t.embedding.length === 0) continue;
        entries.push({
          subjectType: t.subjectType,
          subjectId: t.subjectId,
          displayName: subject.name,
          employeeCode: subject.code,
          embeddingModel: t.embeddingModel,
          enrolledAt: subject.enrolledAt,
          embedding: bufferToEmbedding(t.embedding),
        });
      }
    }

    return entries;
  }

  /** Per-client threshold overrides; NULL columns fall back to env defaults. */
  private async getClientThresholds(
    clientId: string,
  ): Promise<ClientFaceThresholds> {
    const [row] = await this.dataSource
      .query<
        Array<{
          autoAccept: string | null;
          reviewMin: string | null;
          minMargin: string | null;
          minLiveness: string | null;
        }>
      >(
        `SELECT face_auto_accept_score AS "autoAccept",
                face_review_min_score  AS "reviewMin",
                face_min_match_margin  AS "minMargin",
                face_min_liveness_score AS "minLiveness"
           FROM clients WHERE id = $1`,
        [clientId],
      )
      .catch(() => [] as never[]);

    const num = (v: string | null | undefined, fallback: number): number =>
      v !== null && v !== undefined && v !== '' ? Number(v) : fallback;

    const autoAccept = num(row?.autoAccept, MIN_MATCH_SCORE);
    return {
      autoAccept,
      reviewMin: num(row?.reviewMin, REVIEW_MIN_SCORE),
      minMargin: num(row?.minMargin, MIN_MATCH_MARGIN),
      minLiveness:
        row?.minLiveness !== null &&
        row?.minLiveness !== undefined &&
        row?.minLiveness !== ''
          ? Number(row.minLiveness)
          : MIN_LIVENESS_SCORE,
    };
  }

  async recordPunch(
    device: MobileAttendanceDeviceEntity,
    dto: RecordPunchDto,
    ip?: string,
    userAgent?: string,
  ): Promise<PunchResult> {
    // Liveness validation
    if (this.livenessService.livenessRequired) {
      if (dto.offlineSync) {
        // Offline punches: nonce consumed at capture time, re-validated via age check
        if (dto.punchTime) {
          const punchMs = new Date(dto.punchTime).getTime();
          if (Date.now() - punchMs > OFFLINE_MAX_AGE_MS) {
            throw new BadRequestException('Offline punch is too old (>24 h)');
          }
        }
      } else {
        if (!dto.livenessNonce || !dto.livenessChallengeType) {
          throw new BadRequestException(
            'Liveness nonce and challenge type required',
          );
        }
        await this.livenessService.consumeNonce(
          device.id,
          dto.livenessNonce,
          dto.livenessChallengeType,
        );
      }
    }

    // Probe embedding: prefer server-side re-embed of the photo (model
    // upgrades roll out server-side without kiosk app releases), fall back
    // to the device-computed embedding.
    let probe = decodeEmbedding(dto.embeddingB64);
    let probeModel: string | null = dto.embeddingModel ?? null;
    let passiveLiveness: number | null = dto.livenessScore ?? null;

    if (SERVER_EMBED && this.faceClient.enabled && dto.photoB64) {
      try {
        const server = await this.faceClient.extractEmbedding(dto.photoB64);
        if (server) {
          probe = new Float32Array(server.embedding);
          probeModel = server.model;
          if (server.livenessScore !== null) {
            passiveLiveness = server.livenessScore;
          }
        }
      } catch (err) {
        if (err instanceof FaceQualityError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }
    }

    const roster = await this.getRoster(device);

    // Activation delay: reject if enrolled too recently on kiosk
    const eligibleRoster =
      device.mode === 'KIOSK'
        ? roster.filter(
            (r) => Date.now() - r.enrolledAt.getTime() >= ACTIVATION_DELAY_MS,
          )
        : roster;

    // Model compatibility: never compare embeddings across models/dimensions.
    // Names are normalized so aliases of the same family match (the kiosk
    // stores "mobilefacenet", face-svc reports "mobilefacenet-v1").
    const probeModelNorm = normalizeEmbeddingModel(probeModel);
    const comparableRoster = eligibleRoster.filter((r) => {
      if (r.embedding.length !== probe.length) return false;
      const rosterModelNorm = normalizeEmbeddingModel(r.embeddingModel);
      return (
        !probeModelNorm ||
        !rosterModelNorm ||
        rosterModelNorm === probeModelNorm
      );
    });

    if (comparableRoster.length === 0) {
      if (eligibleRoster.length > 0) {
        this.logger.warn(
          `face punch: 0/${eligibleRoster.length} roster entries comparable ` +
            `with probe model=${probeModel ?? 'unknown'} dim=${probe.length} — ` +
            `subjects likely need re-enrollment after a model upgrade ` +
            `(client=${device.clientId} device=${device.id})`,
        );
      }
      throw new BadRequestException('No eligible enrollments on this device');
    }

    // Score every template, then keep the best template per subject.
    // Margin is computed BETWEEN SUBJECTS (best vs best-other-person) —
    // templates of the same person must not eat the margin.
    const bySubject = new Map<string, RosterEntry & { cosine: number }>();
    for (const r of comparableRoster) {
      const cosine = cosineSim(probe, r.embedding);
      const key = `${r.subjectType}:${r.subjectId}`;
      const prev = bySubject.get(key);
      if (!prev || cosine > prev.cosine) {
        bySubject.set(key, { ...r, cosine });
      }
    }
    const subjects = [...bySubject.values()].sort(
      (a, b) => b.cosine - a.cosine,
    );

    const best = subjects[0];
    const secondBest = subjects[1];
    const margin = secondBest ? best.cosine - secondBest.cosine : 1;

    const thresholds = await this.getClientThresholds(device.clientId);
    const requiredMatchScore =
      subjects.length <= 1
        ? Math.max(thresholds.autoAccept, MIN_SINGLE_GALLERY_MATCH_SCORE)
        : thresholds.autoAccept;

    const livenessOk =
      thresholds.minLiveness === null ||
      passiveLiveness === null ||
      passiveLiveness >= thresholds.minLiveness;

    this.logger.log(
      [
        'face punch match scores',
        `client=${device.clientId}`,
        `device=${device.id}`,
        `mode=${device.mode}`,
        `branch=${device.branchId ?? 'none'}`,
        `gallery=${subjects.length}`,
        `templates=${comparableRoster.length}`,
        `probeModel=${probeModel ?? 'unknown'}`,
        `bestSubject=${best.subjectType}:${best.subjectId}`,
        `bestCosine=${best.cosine.toFixed(3)}`,
        `secondSubject=${secondBest ? `${secondBest.subjectType}:${secondBest.subjectId}` : 'none'}`,
        `secondCosine=${secondBest ? secondBest.cosine.toFixed(3) : 'n/a'}`,
        `margin=${margin.toFixed(3)}`,
        `threshold=${requiredMatchScore.toFixed(3)}`,
        `reviewMin=${thresholds.reviewMin.toFixed(3)}`,
        `marginThreshold=${thresholds.minMargin.toFixed(3)}`,
        `liveness=${passiveLiveness !== null ? passiveLiveness.toFixed(3) : 'n/a'}`,
        `livenessOk=${livenessOk}`,
      ].join(' '),
    );

    // ── Two-level decision ──────────────────────────────────────────────
    let decision: 'AUTO' | 'REVIEW_PENDING';
    const reviewReasons: string[] = [];
    if (
      best.cosine >= requiredMatchScore &&
      margin >= thresholds.minMargin &&
      livenessOk
    ) {
      decision = 'AUTO';
    } else if (REVIEW_ENABLED && best.cosine >= thresholds.reviewMin) {
      decision = 'REVIEW_PENDING';
      if (best.cosine < requiredMatchScore)
        reviewReasons.push(
          `score ${best.cosine.toFixed(3)} < ${requiredMatchScore.toFixed(3)}`,
        );
      if (margin < thresholds.minMargin)
        reviewReasons.push(
          `margin ${margin.toFixed(3)} < ${thresholds.minMargin.toFixed(3)}`,
        );
      if (!livenessOk)
        reviewReasons.push(
          `liveness ${passiveLiveness?.toFixed(3)} < ${thresholds.minLiveness?.toFixed(3)}`,
        );
    } else if (best.cosine < thresholds.reviewMin) {
      throw new BadRequestException(
        `No face match above threshold (best cosine: ${best.cosine.toFixed(3)})`,
      );
    } else {
      throw new BadRequestException(
        `Ambiguous match: margin ${margin.toFixed(3)} below required ${thresholds.minMargin}`,
      );
    }

    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();

    // Cooldown: reject if same person punched within PUNCH_COOLDOWN_MS (prevents retries/double-scan).
    // Review-band punches don't count — a held punch must not block the retry.
    if (decision === 'AUTO' && PUNCH_COOLDOWN_MS > 0) {
      const recent = await this.dataSource.query<Array<{ punch_time: Date }>>(
        `SELECT punch_time FROM (
           (SELECT punch_time FROM mobile_attendance_punches
             WHERE client_id = $1 AND employee_id = $2
               AND decision IN ${COUNTED_DECISIONS}
             ORDER BY punch_time DESC LIMIT 1)
           UNION ALL
           (SELECT punch_time FROM contractor_biometric_punches
             WHERE client_id = $1 AND contractor_employee_id = $2
               AND decision IN ${COUNTED_DECISIONS}
             ORDER BY punch_time DESC LIMIT 1)
         ) t ORDER BY punch_time DESC LIMIT 1`,
        [device.clientId, best.subjectId],
      );
      if (recent.length > 0) {
        // Compare against the incoming punch's own timestamp, not wall-clock now —
        // offline-queued retries carry an old punchTime and must not look "fresh"
        // just because they synced late.
        const gap = Math.abs(
          punchTime.getTime() - new Date(recent[0].punch_time).getTime(),
        );
        if (gap < PUNCH_COOLDOWN_MS) {
          throw new BadRequestException(
            `Punch too soon — wait ${Math.ceil((PUNCH_COOLDOWN_MS - gap) / 1000)} more seconds`,
          );
        }
      }
    }

    const resolvedDirection =
      decision === 'AUTO'
        ? await this.resolveNextPunchDirection(
            device.clientId,
            best.subjectType,
            best.subjectId,
            punchTime,
          )
        : 'AUTO';

    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage.uploadPhoto(
        dto.photoB64,
        device.clientId,
        best.subjectId,
      );
    }

    const livenessPassedAt = dto.livenessNonce ? new Date() : null;

    const auditColumns = {
      matchScore: toMatchScore(best.cosine),
      matchCosine: best.cosine,
      matchThreshold: requiredMatchScore,
      matchMargin: margin,
      matchMarginThreshold: thresholds.minMargin,
      secondBestSubjectType: secondBest?.subjectType ?? null,
      secondBestSubjectId: secondBest?.subjectId ?? null,
      secondBestCosine: secondBest?.cosine ?? null,
      gallerySize: subjects.length,
      livenessScore: passiveLiveness,
      livenessChallengeType: dto.livenessChallengeType ?? null,
      livenessChallengePassedAt: livenessPassedAt,
      livenessNonce: dto.livenessNonce ?? null,
      embeddingModel: probeModel,
      photoUrl,
      captureLat: dto.captureLat ?? null,
      captureLng: dto.captureLng ?? null,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      isMockLocation: dto.isMockLocation ?? null,
      isRooted: dto.isRooted ?? null,
      offlineSync: dto.offlineSync ?? false,
      decision,
      reviewNote:
        decision === 'REVIEW_PENDING' ? reviewReasons.join('; ') : null,
    };

    if (best.subjectType === 'EMPLOYEE') {
      await this.dataSource.transaction(async (manager) => {
        const savedPunch = await manager
          .getRepository(MobileAttendancePunchEntity)
          .save({
            clientId: device.clientId,
            branchId: device.branchId,
            deviceId: device.id,
            employeeId: best.subjectId,
            direction: resolvedDirection,
            punchTime,
            ...auditColumns,
          });
        if (decision === 'AUTO') {
          await this.mirrorEmployeePunchToDailyAttendance(
            {
              clientId: device.clientId,
              branchId: device.branchId,
              employeeCode: best.employeeCode ?? best.subjectId,
              punchTime,
              direction: resolvedDirection,
              deviceId: device.id,
              source: device.mode === 'ESS' ? 'MOBILE_ESS' : 'MOBILE_KIOSK',
            },
            manager,
          );
        }
        return savedPunch;
      });
    } else {
      await this.contractorPunchRepo.save({
        clientId: device.clientId,
        branchId: device.branchId,
        deviceId: device.id,
        contractorEmployeeId: best.subjectId,
        direction: resolvedDirection,
        punchTime,
        ...auditColumns,
      });
    }

    if (decision === 'REVIEW_PENDING') {
      this.logger.warn(
        `face punch held for review: subject=${best.subjectType}:${best.subjectId} ` +
          `reasons=[${reviewReasons.join('; ')}] client=${device.clientId} device=${device.id}`,
      );
      // Deliberately generic: don't confirm WHO matched on a borderline
      // attempt — that would let someone probe the gallery.
      return {
        ok: true,
        review: true,
        message:
          'Attendance captured but held for supervisor review. Please contact your admin if this repeats.',
      };
    }

    // Template auto-refresh: a very confident match keeps the gallery fresh.
    if (
      AUTO_REFRESH_MIN_SCORE !== null &&
      best.cosine >= AUTO_REFRESH_MIN_SCORE
    ) {
      await this.templateService
        .appendTemplate(
          device.clientId,
          device.branchId,
          best.subjectType,
          best.subjectId,
          probe,
          probeModel,
          'AUTO_REFRESH',
        )
        .catch((err) =>
          this.logger.warn(`template auto-refresh failed: ${err?.message}`),
        );
    }

    return {
      ok: true,
      employeeName: best.displayName,
      employeeCode: best.employeeCode ?? best.subjectId,
      direction: resolvedDirection,
      punchTime: punchTime.toISOString(),
    };
  }

  private async resolveNextPunchDirection(
    clientId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    subjectId: string,
    punchTime: Date,
    opts: { endExclusive?: Date } = {},
  ): Promise<'IN' | 'OUT'> {
    const { start, end: dayEnd } = this.businessDayBoundsUtc(punchTime);
    // Approving a held punch after later punches already landed must resolve
    // direction against the state of the day AT the punch's own time, not
    // against everything that came after — otherwise a 09:00 approval done
    // after a 10:00 AUTO punch flips to OUT (or fails as "completed").
    const end =
      opts.endExclusive && opts.endExclusive < dayEnd
        ? opts.endExclusive
        : dayEnd;

    const sql =
      subjectType === 'EMPLOYEE'
        ? `SELECT punch_time, direction
             FROM (
               SELECT punch_time, direction
                 FROM mobile_attendance_punches
                WHERE client_id = $1
                  AND employee_id = $2
                  AND punch_time >= $3
                  AND punch_time < $4
                  AND decision IN ${COUNTED_DECISIONS}
               UNION ALL
               SELECT punch_time, direction
                 FROM biometric_punches
                WHERE client_id = $1
                  AND employee_id = $2
                  AND punch_time >= $3
                  AND punch_time < $4
                  -- Mobile punches are MIRRORED into biometric_punches by the
                  -- daily-attendance ingest; counting them here double-counts
                  -- every kiosk punch (1 punch looked "completed for today"
                  -- and check-out could never be recorded). Only count punches
                  -- from real fingerprint devices / imports here.
                  AND COALESCE(source, 'DEVICE') NOT IN ('MOBILE_KIOSK','MOBILE_ESS')
             ) t
            ORDER BY punch_time ASC`
        : `SELECT punch_time, direction
             FROM contractor_biometric_punches
            WHERE client_id = $1
              AND contractor_employee_id = $2
              AND punch_time >= $3
              AND punch_time < $4
              AND decision IN ${COUNTED_DECISIONS}
            ORDER BY punch_time ASC`;

    const todayRows = await this.dataSource.query<
      Array<{ punch_time: Date; direction: 'IN' | 'OUT' | 'AUTO' }>
    >(sql, [clientId, subjectId, start, end]);

    if (todayRows.length >= 2) {
      throw new BadRequestException('Attendance already completed for today');
    }

    return todayRows.length === 0 ? 'IN' : 'OUT';
  }

  private businessDayBoundsUtc(d: Date): { start: Date; end: Date } {
    const offsetMs = BUSINESS_TZ_OFFSET_MIN * 60 * 1000;
    const local = new Date(d.getTime() + offsetMs);
    const startLocalUtcMs = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    );
    const start = new Date(startLocalUtcMs - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private async mirrorEmployeePunchToDailyAttendance(
    args: {
      clientId: string;
      branchId: string | null;
      employeeCode: string;
      punchTime: Date;
      direction: 'IN' | 'OUT' | 'AUTO';
      deviceId: string;
      source: 'MOBILE_KIOSK' | 'MOBILE_ESS';
    },
    manager?: EntityManager,
  ): Promise<void> {
    try {
      await this.biometricService.ingest(
        args.clientId,
        [
          {
            employeeCode: args.employeeCode,
            punchTime: args.punchTime.toISOString(),
            direction: args.direction,
            deviceId: args.deviceId,
            branchId: args.branchId ?? undefined,
            source: args.source,
          },
        ],
        true,
        manager,
      );
    } catch (err) {
      this.logger.error(
        [
          'accepted mobile attendance punch could not be mirrored to daily attendance',
          `client=${args.clientId}`,
          `employeeCode=${args.employeeCode}`,
          `device=${args.deviceId}`,
          `source=${args.source}`,
          `punchTime=${args.punchTime.toISOString()}`,
        ].join(' '),
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  // ─── Review queue ──────────────────────────────────────────────────────────

  async listReviewPunches(
    clientId: string,
    opts: { branchIds?: string[]; status?: string; limit?: number } = {},
  ): Promise<unknown[]> {
    const status = opts.status ?? 'REVIEW_PENDING';
    const params: unknown[] = [clientId, status];
    let branchFilter = '';
    if (opts.branchIds && opts.branchIds.length > 0) {
      params.push(opts.branchIds);
      branchFilter = `AND p.branch_id = ANY($${params.length}::uuid[])`;
    }
    params.push(Math.min(500, Math.max(1, opts.limit ?? 100)));

    return this.dataSource.query(
      `SELECT p.id,
              'EMPLOYEE' AS "subjectType",
              p.employee_id AS "subjectId",
              e.name AS "subjectName",
              e.employee_code AS "subjectCode",
              p.branch_id AS "branchId",
              p.device_id AS "deviceId",
              p.punch_time AS "punchTime",
              p.match_cosine AS "matchCosine",
              p.match_threshold AS "matchThreshold",
              p.match_margin AS "matchMargin",
              p.liveness_score AS "livenessScore",
              p.photo_url AS "photoUrl",
              p.decision,
              p.review_note AS "reviewNote",
              p.reviewed_by AS "reviewedBy",
              p.reviewed_at AS "reviewedAt",
              p.created_at AS "createdAt"
         FROM mobile_attendance_punches p
         JOIN employees e ON e.id = p.employee_id
        WHERE p.client_id = $1 AND p.decision = $2 ${branchFilter}
        UNION ALL
       SELECT p.id,
              'CONTRACTOR' AS "subjectType",
              p.contractor_employee_id AS "subjectId",
              ce.name AS "subjectName",
              NULL AS "subjectCode",
              p.branch_id AS "branchId",
              p.device_id AS "deviceId",
              p.punch_time AS "punchTime",
              p.match_cosine AS "matchCosine",
              p.match_threshold AS "matchThreshold",
              p.match_margin AS "matchMargin",
              p.liveness_score AS "livenessScore",
              p.photo_url AS "photoUrl",
              p.decision,
              p.review_note AS "reviewNote",
              p.reviewed_by AS "reviewedBy",
              p.reviewed_at AS "reviewedAt",
              p.created_at AS "createdAt"
         FROM contractor_biometric_punches p
         JOIN contractor_employees ce ON ce.id = p.contractor_employee_id
        WHERE p.client_id = $1 AND p.decision = $2 ${branchFilter}
        ORDER BY "punchTime" DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  async reviewPunch(
    clientId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    punchId: string,
    action: 'APPROVE' | 'REJECT',
    actorUserId: string,
    note?: string,
  ): Promise<{ ok: true; decision: string }> {
    const newDecision =
      action === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED';

    if (subjectType === 'EMPLOYEE') {
      const punch = await this.punchRepo.findOne({
        where: { id: punchId, clientId },
      });
      if (!punch) throw new NotFoundException('Punch not found');
      if (punch.decision !== 'REVIEW_PENDING') {
        throw new BadRequestException(
          `Punch is not pending review (decision: ${punch.decision})`,
        );
      }

      await this.dataSource.transaction(async (manager) => {
        // Approve resolves direction against counted punches that happened
        // BEFORE this held punch — later AUTO punches must not flip it.
        let direction: 'IN' | 'OUT' | 'AUTO' = 'AUTO';
        if (action === 'APPROVE') {
          direction = await this.resolveNextPunchDirection(
            clientId,
            'EMPLOYEE',
            punch.employeeId,
            punch.punchTime,
            { endExclusive: punch.punchTime },
          );
        }
        await manager.getRepository(MobileAttendancePunchEntity).update(
          { id: punchId },
          {
            decision: newDecision,
            direction,
            reviewedBy: actorUserId,
            reviewedAt: new Date(),
            reviewNote: note ?? punch.reviewNote,
          },
        );
        if (action === 'APPROVE') {
          const [emp] = await manager.query<Array<{ employee_code: string }>>(
            `SELECT employee_code FROM employees WHERE id = $1`,
            [punch.employeeId],
          );
          await this.mirrorEmployeePunchToDailyAttendance(
            {
              clientId,
              branchId: punch.branchId,
              employeeCode: emp?.employee_code ?? punch.employeeId,
              punchTime: punch.punchTime,
              direction,
              deviceId: punch.deviceId,
              source: 'MOBILE_KIOSK',
            },
            manager,
          );
        }
      });
      return { ok: true, decision: newDecision };
    }

    const punch = await this.contractorPunchRepo.findOne({
      where: { id: punchId, clientId },
    });
    if (!punch) throw new NotFoundException('Punch not found');
    if (punch.decision !== 'REVIEW_PENDING') {
      throw new BadRequestException(
        `Punch is not pending review (decision: ${punch.decision})`,
      );
    }
    let direction: 'IN' | 'OUT' | 'AUTO' = 'AUTO';
    if (action === 'APPROVE') {
      direction = await this.resolveNextPunchDirection(
        clientId,
        'CONTRACTOR',
        punch.contractorEmployeeId,
        punch.punchTime,
        { endExclusive: punch.punchTime },
      );
    }
    await this.contractorPunchRepo.update(
      { id: punchId },
      {
        decision: newDecision,
        direction,
        reviewedBy: actorUserId,
        reviewedAt: new Date(),
        reviewNote: note ?? punch.reviewNote,
      },
    );
    return { ok: true, decision: newDecision };
  }

  // ─── Admin list / CRUD endpoints ──────────────────────────────────────────

  async listPunches(
    clientId: string,
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      employeeId?: string;
      limit?: number;
    } = {},
  ): Promise<MobileAttendancePunchEntity[]> {
    const qb = this.punchRepo
      .createQueryBuilder('p')
      .where('p.clientId = :clientId', { clientId })
      .orderBy('p.punchTime', 'DESC');

    if (opts.from) qb.andWhere('p.punchTime >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('p.punchTime <= :to', { to: opts.to });
    if (opts.branchId)
      qb.andWhere('p.branchId = :branchId', { branchId: opts.branchId });
    if (opts.employeeId)
      qb.andWhere('p.employeeId = :employeeId', {
        employeeId: opts.employeeId,
      });
    if (opts.limit) qb.take(opts.limit);

    return qb.getMany();
  }

  async listContractorPunches(
    clientId: string,
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      contractorEmployeeId?: string;
      limit?: number;
    } = {},
  ): Promise<ContractorBiometricPunchEntity[]> {
    const qb = this.contractorPunchRepo
      .createQueryBuilder('p')
      .where('p.clientId = :clientId', { clientId })
      .orderBy('p.punchTime', 'DESC');

    if (opts.from) qb.andWhere('p.punchTime >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('p.punchTime <= :to', { to: opts.to });
    if (opts.branchId)
      qb.andWhere('p.branchId = :branchId', { branchId: opts.branchId });
    if (opts.contractorEmployeeId)
      qb.andWhere('p.contractorEmployeeId = :contractorEmployeeId', {
        contractorEmployeeId: opts.contractorEmployeeId,
      });
    if (opts.limit) qb.take(opts.limit);

    return qb.getMany();
  }

  async createContractorPunch(
    clientId: string,
    body: {
      contractorEmployeeId: string;
      punchTime: string;
      direction: 'IN' | 'OUT' | 'AUTO';
    },
  ): Promise<{ ok: true; id: string }> {
    const punch = await this.contractorPunchRepo.save({
      clientId,
      branchId: null,
      deviceId: '00000000-0000-0000-0000-000000000000',
      contractorEmployeeId: body.contractorEmployeeId,
      direction: body.direction,
      punchTime: new Date(body.punchTime),
      offlineSync: false,
    });
    return { ok: true, id: punch.id };
  }

  async updateContractorPunch(
    clientId: string,
    id: string,
    body: { punchTime?: string; direction?: string },
  ): Promise<{ ok: true; id: string; punchTime: string; direction: string }> {
    const punch = await this.contractorPunchRepo.findOne({
      where: { id, clientId },
    });
    if (!punch) throw new NotFoundException('Contractor punch not found');

    if (body.punchTime) punch.punchTime = new Date(body.punchTime);
    if (body.direction)
      punch.direction = body.direction as 'IN' | 'OUT' | 'AUTO';

    const saved = await this.contractorPunchRepo.save(punch);
    return {
      ok: true,
      id: saved.id,
      punchTime: saved.punchTime.toISOString(),
      direction: saved.direction,
    };
  }

  async deleteContractorPunch(
    clientId: string,
    id: string,
  ): Promise<{ ok: true; deleted: number }> {
    const result = await this.contractorPunchRepo.delete({ id, clientId });
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Contractor punch not found');
    }
    return { ok: true, deleted: result.affected };
  }
}
