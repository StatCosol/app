import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MobileAttendanceDeviceEntity } from '../devices/device.entity';
import { FaceEnrollmentEntity } from '../enrollment/face-enrollment.entity';
import { ContractorFaceEnrollmentEntity } from '../enrollment/contractor-face-enrollment.entity';
import { MobileAttendancePunchEntity } from './punch.entity';
import { ContractorBiometricPunchEntity } from './contractor-punch.entity';
import { LivenessService } from '../liveness/liveness.service';
import { FacePhotoStorageService } from '../face/face-photo-storage.service';
import {
  bufferToEmbedding,
  cosineSim,
  decodeEmbedding,
  toMatchScore,
} from '../face/face-math';
import { RecordPunchDto } from './punch.dto';

const MIN_MATCH_SCORE = Number(process.env.FACE_MIN_MATCH_SCORE ?? 0.90);
const MIN_MATCH_MARGIN = Number(process.env.FACE_MIN_MATCH_MARGIN ?? 0.04);
const ACTIVATION_DELAY_MS =
  Number(process.env.FACE_KIOSK_ACTIVATION_DELAY_MIN ?? 15) * 60 * 1000;
const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RosterEntry {
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  subjectId: string;
  displayName?: string;
  embeddingModel: string | null;
  enrolledAt: Date;
  embedding: Float32Array;
}

export interface PunchResult {
  punchId: string;
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';
  subjectId: string;
  matchScore: number;
  direction: string;
  punchTime: Date;
}

@Injectable()
export class PunchService {
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
  ) {}

  async getRoster(device: MobileAttendanceDeviceEntity): Promise<RosterEntry[]> {
    const empRows = await this.enrollRepo.find({
      where: { clientId: device.clientId, isActive: true },
      select: ['employeeId', 'embedding', 'embeddingModel', 'enrolledAt'],
    });
    const conRows = await this.contractorEnrollRepo.find({
      where: { clientId: device.clientId, isActive: true },
      select: ['contractorEmployeeId', 'embedding', 'embeddingModel', 'enrolledAt'],
    });

    const entries: RosterEntry[] = [];

    for (const r of empRows) {
      if (!r.embedding || r.embedding.length === 0) continue;
      entries.push({
        subjectType: 'EMPLOYEE',
        subjectId: r.employeeId,
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
          throw new BadRequestException('Liveness nonce and challenge type required');
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
        ? roster.filter((r) => Date.now() - r.enrolledAt.getTime() >= ACTIVATION_DELAY_MS)
        : roster;

    if (eligibleRoster.length === 0) {
      throw new BadRequestException('No eligible enrollments on this device');
    }

    // Find best and second-best match
    const scored = eligibleRoster
      .map((r) => ({ ...r, score: toMatchScore(cosineSim(probe, r.embedding)) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const secondBest = scored[1];

    if (best.score < MIN_MATCH_SCORE) {
      throw new BadRequestException(
        `No face match above threshold (best score: ${best.score.toFixed(3)})`,
      );
    }

    const margin = secondBest ? best.score - secondBest.score : 1;
    if (margin < MIN_MATCH_MARGIN) {
      throw new BadRequestException(
        `Ambiguous match: margin ${margin.toFixed(3)} below required ${MIN_MATCH_MARGIN}`,
      );
    }

    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();

    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage.uploadPhoto(dto.photoB64, device.clientId, best.subjectId);
    }

    const livenessPassedAt = dto.livenessNonce ? new Date() : null;

    if (best.subjectType === 'EMPLOYEE') {
      const punch = await this.punchRepo.save({
        clientId: device.clientId,
        branchId: device.branchId,
        deviceId: device.id,
        employeeId: best.subjectId,
        direction: dto.direction,
        punchTime,
        matchScore: best.score,
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
        punchId: punch.id,
        subjectType: 'EMPLOYEE',
        subjectId: best.subjectId,
        matchScore: best.score,
        direction: dto.direction,
        punchTime,
      };
    } else {
      const punch = await this.contractorPunchRepo.save({
        clientId: device.clientId,
        branchId: device.branchId,
        deviceId: device.id,
        contractorEmployeeId: best.subjectId,
        direction: dto.direction,
        punchTime,
        matchScore: best.score,
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
        punchId: punch.id,
        subjectType: 'CONTRACTOR',
        subjectId: best.subjectId,
        matchScore: best.score,
        direction: dto.direction,
        punchTime,
      };
    }
  }
}
