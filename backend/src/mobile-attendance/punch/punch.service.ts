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
import { MobileAttendancePunchEntity } from './punch.entity';
import { ContractorBiometricPunchEntity } from './contractor-punch.entity';
import { LivenessService } from '../liveness/liveness.service';
import { FacePhotoStorageService } from '../face/face-photo-storage.service';
import { BiometricService } from '../../biometric/biometric.service';
import {
  bufferToEmbedding,
  cosineSim,
  decodeEmbedding,
  toMatchScore,
} from '../face/face-math';
import { RecordPunchDto } from './punch.dto';

// MobileFaceNet real-world same-person cosine similarity is ~0.70–0.87; 0.90 was unreachable.
const MIN_MATCH_SCORE = Number(process.env.FACE_MIN_MATCH_SCORE ?? 0.72);
const MIN_MATCH_MARGIN = Number(process.env.FACE_MIN_MATCH_MARGIN ?? 0.05);
// Fresh enrollments become punch-eligible after the kiosk success screen clears.
const ACTIVATION_DELAY_MS =
  Number(process.env.FACE_KIOSK_ACTIVATION_DELAY_SEC ?? 10) * 1000;
const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Minimum gap between punches for the same person — prevents double-punch from retries or rapid re-scan.
const PUNCH_COOLDOWN_MS =
  Number(process.env.FACE_PUNCH_COOLDOWN_SEC ?? 30) * 1000;
const BUSINESS_TZ_OFFSET_MIN = 330;

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
  employeeName: string;
  employeeCode: string;
  direction: string;
  punchTime: string;
}

@Injectable()
export class PunchService {
  private readonly logger = new Logger(PunchService.name);

  constructor(
    @InjectRepository(FaceEnrollmentEntity)
    private readonly enrollRepo: Repository<FaceEnrollmentEntity>,
    @InjectRepository(ContractorFaceEnrollmentEntity)
    private readonly contractorEnrollRepo: Repository<ContractorFaceEnrollmentEntity>,
    @InjectRepository(MobileAttendancePunchEntity)
    private readonly punchRepo: Repository<MobileAttendancePunchEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    private readonly livenessService: LivenessService,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly biometricService: BiometricService,
    private readonly dataSource: DataSource,
  ) {}

  async getRoster(
    device: MobileAttendanceDeviceEntity,
  ): Promise<RosterEntry[]> {
    // Raw SQL so we can JOIN to employees/contractor_employees for display names.
    const empParams: unknown[] = [device.clientId];
    const empBranch = device.branchId
      ? `AND fe.branch_id = $${empParams.push(device.branchId)}`
      : '';

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
          ${empBranch}`,
      empParams,
    );

    const conParams: unknown[] = [device.clientId];
    const conBranch = device.branchId
      ? `AND cfe.branch_id = $${conParams.push(device.branchId)}`
      : '';

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
          ${conBranch}`,
      conParams,
    );

    const entries: RosterEntry[] = [];

    for (const r of empRows) {
      if (!r.embedding || r.embedding.length === 0) continue;
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
      entries.push({
        subjectType: 'CONTRACTOR',
        subjectId: c.contractorEmployeeId,
        displayName: c.name,
        embeddingModel: c.embeddingModel,
        enrolledAt: c.enrolledAt,
        embedding: bufferToEmbedding(c.embedding),
      });
    }

    return entries;
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

    const probe = decodeEmbedding(dto.embeddingB64);
    const roster = await this.getRoster(device);

    // Activation delay: reject if enrolled too recently on kiosk
    const eligibleRoster =
      device.mode === 'KIOSK'
        ? roster.filter(
            (r) => Date.now() - r.enrolledAt.getTime() >= ACTIVATION_DELAY_MS,
          )
        : roster;

    if (eligibleRoster.length === 0) {
      throw new BadRequestException('No eligible enrollments on this device');
    }

    // Find best and second-best match.
    // MIN_MATCH_SCORE is a raw cosine threshold (e.g. 0.90); toMatchScore is
    // applied only to the value stored/returned for display.
    const scored = eligibleRoster
      .map((r) => ({ ...r, cosine: cosineSim(probe, r.embedding) }))
      .sort((a, b) => b.cosine - a.cosine);

    const best = scored[0];
    const secondBest = scored[1];
    const margin = secondBest ? best.cosine - secondBest.cosine : 1;

    this.logger.log(
      [
        'face punch match scores',
        `client=${device.clientId}`,
        `device=${device.id}`,
        `mode=${device.mode}`,
        `branch=${device.branchId ?? 'none'}`,
        `gallery=${eligibleRoster.length}`,
        `bestSubject=${best.subjectType}:${best.subjectId}`,
        `bestCosine=${best.cosine.toFixed(3)}`,
        `secondSubject=${secondBest ? `${secondBest.subjectType}:${secondBest.subjectId}` : 'none'}`,
        `secondCosine=${secondBest ? secondBest.cosine.toFixed(3) : 'n/a'}`,
        `margin=${margin.toFixed(3)}`,
        `threshold=${MIN_MATCH_SCORE.toFixed(3)}`,
        `marginThreshold=${MIN_MATCH_MARGIN.toFixed(3)}`,
      ].join(' '),
    );

    if (best.cosine < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `No face match above threshold (best cosine: ${best.cosine.toFixed(3)})`,
      );
    }

    if (margin < MIN_MATCH_MARGIN) {
      throw new BadRequestException(
        `Ambiguous match: margin ${margin.toFixed(3)} below required ${MIN_MATCH_MARGIN}`,
      );
    }

    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();

    // Cooldown: reject if same person punched within PUNCH_COOLDOWN_MS (prevents retries/double-scan).
    if (PUNCH_COOLDOWN_MS > 0) {
      const recent = await this.dataSource.query<Array<{ punch_time: Date }>>(
        `SELECT punch_time FROM (
           (SELECT punch_time FROM mobile_attendance_punches
             WHERE client_id = $1 AND employee_id = $2
             ORDER BY punch_time DESC LIMIT 1)
           UNION ALL
           (SELECT punch_time FROM contractor_biometric_punches
             WHERE client_id = $1 AND contractor_employee_id = $2
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

    const resolvedDirection = await this.resolveNextPunchDirection(
      device.clientId,
      best.subjectType,
      best.subjectId,
      punchTime,
    );

    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage.uploadPhoto(
        dto.photoB64,
        device.clientId,
        best.subjectId,
      );
    }

    const livenessPassedAt = dto.livenessNonce ? new Date() : null;

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
            matchScore: toMatchScore(best.cosine),
            matchCosine: best.cosine,
            matchThreshold: MIN_MATCH_SCORE,
            matchMargin: margin,
            matchMarginThreshold: MIN_MATCH_MARGIN,
            secondBestSubjectType: secondBest?.subjectType ?? null,
            secondBestSubjectId: secondBest?.subjectId ?? null,
            secondBestCosine: secondBest?.cosine ?? null,
            gallerySize: eligibleRoster.length,
            livenessScore: dto.livenessScore ?? null,
            livenessChallengeType: dto.livenessChallengeType ?? null,
            livenessChallengePassedAt: livenessPassedAt,
            livenessNonce: dto.livenessNonce ?? null,
            embeddingModel: dto.embeddingModel ?? null,
            photoUrl,
            captureLat: dto.captureLat ?? null,
            captureLng: dto.captureLng ?? null,
            ip: ip ?? null,
            userAgent: userAgent ?? null,
            isMockLocation: dto.isMockLocation ?? null,
            isRooted: dto.isRooted ?? null,
            offlineSync: dto.offlineSync ?? false,
          });
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
        return savedPunch;
      });
      return {
        ok: true,
        employeeName: best.displayName,
        employeeCode: best.employeeCode ?? best.subjectId,
        direction: resolvedDirection,
        punchTime: punchTime.toISOString(),
      };
    } else {
      await this.contractorPunchRepo.save({
        clientId: device.clientId,
        branchId: device.branchId,
        deviceId: device.id,
        contractorEmployeeId: best.subjectId,
        direction: resolvedDirection,
        punchTime,
        matchScore: toMatchScore(best.cosine),
        matchCosine: best.cosine,
        matchThreshold: MIN_MATCH_SCORE,
        matchMargin: margin,
        matchMarginThreshold: MIN_MATCH_MARGIN,
        secondBestSubjectType: secondBest?.subjectType ?? null,
        secondBestSubjectId: secondBest?.subjectId ?? null,
        secondBestCosine: secondBest?.cosine ?? null,
        gallerySize: eligibleRoster.length,
        livenessScore: dto.livenessScore ?? null,
        livenessChallengeType: dto.livenessChallengeType ?? null,
        livenessChallengePassedAt: livenessPassedAt,
        livenessNonce: dto.livenessNonce ?? null,
        embeddingModel: dto.embeddingModel ?? null,
        photoUrl,
        captureLat: dto.captureLat ?? null,
        captureLng: dto.captureLng ?? null,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        isMockLocation: dto.isMockLocation ?? null,
        isRooted: dto.isRooted ?? null,
        offlineSync: dto.offlineSync ?? false,
      });
      return {
        ok: true,
        employeeName: best.displayName,
        employeeCode: best.subjectId,
        direction: resolvedDirection,
        punchTime: punchTime.toISOString(),
      };
    }
  }

  private async resolveNextPunchDirection(
    clientId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR',
    subjectId: string,
    punchTime: Date,
  ): Promise<'IN' | 'OUT'> {
    const { start, end } = this.businessDayBoundsUtc(punchTime);

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
               UNION ALL
               SELECT punch_time, direction
                 FROM biometric_punches
                WHERE client_id = $1
                  AND employee_id = $2
                  AND punch_time >= $3
                  AND punch_time < $4
             ) t
            ORDER BY punch_time ASC`
        : `SELECT punch_time, direction
             FROM contractor_biometric_punches
            WHERE client_id = $1
              AND contractor_employee_id = $2
              AND punch_time >= $3
              AND punch_time < $4
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
