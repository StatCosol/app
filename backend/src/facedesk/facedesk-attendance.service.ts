import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  averageEmbeddings,
  normalizeEmbeddingModel,
} from '../mobile-attendance/face/face-math';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import {
  FaceDeskAttendanceEntity,
} from './entities/facedesk.entities';
import { FaceDeskFaceService } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import {
  FACEDESK_LIVENESS_PROVIDER,
  FaceDeskLivenessProvider,
} from './facedesk-liveness.provider';
import { MarkAttendanceDto } from './facedesk.dto';
import { FaceDeskOfflineSyncService } from './facedesk-offline-sync.service';
import { FaceDeskFailedAttemptService } from './facedesk-failed-attempt.service';
import { FaceDeskPinAttendanceService } from './facedesk-pin-attendance.service';
import { FaceDeskFaceOnlyAttendanceService } from './facedesk-face-only-attendance.service';
import { FaceDeskPunchAcceptService } from './facedesk-punch-accept.service';
import { FaceDeskPunchDirectionService } from './facedesk-punch-direction.service';

export interface MarkResult {
  status: 'MARKED' | 'RETRY' | 'REJECTED' | 'REVIEW';
  message: string;
  employeeName?: string;
  employeeCode?: string;
  punchType?: 'IN' | 'OUT';
  punchTime?: string;
  branchId?: string | null;
  confidencePercent?: number;
}

@Injectable()
export class FaceDeskAttendanceService {
  constructor(
    @InjectRepository(FaceDeskAttendanceEntity)
    private readonly attRepo: Repository<FaceDeskAttendanceEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    private readonly faceService: FaceDeskFaceService,
    private readonly settings: FaceDeskSettingsService,
    @Inject(FACEDESK_LIVENESS_PROVIDER)
    private readonly liveness: FaceDeskLivenessProvider,
    @Inject(forwardRef(() => FaceDeskOfflineSyncService))
    private readonly offlineSyncService: FaceDeskOfflineSyncService,
    private readonly failedAttemptService: FaceDeskFailedAttemptService,
    private readonly pinAttendanceService: FaceDeskPinAttendanceService,
    private readonly faceOnlyAttendanceService: FaceDeskFaceOnlyAttendanceService,
    private readonly punchAcceptService: FaceDeskPunchAcceptService,
    private readonly directionService: FaceDeskPunchDirectionService,
  ) {}

  async markAttendance(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
  ): Promise<MarkResult> {
    const eff = await this.settings.getEffective(clientId);

    if (dto.offlineRef) {
      const existing = await this.attRepo.findOne({
        where: { clientId, offlineRef: dto.offlineRef },
      });
      if (existing) {
        return {
          status: 'MARKED',
          message: 'Attendance already recorded',
          punchType: existing.punchType as 'IN' | 'OUT',
          punchTime: existing.punchTime.toISOString(),
        };
      }
      const existingContractorPunch = await this.contractorPunchRepo.findOne({
        where: { clientId, offlineRef: dto.offlineRef },
      });
      if (existingContractorPunch) {
        return this.punchAcceptService.contractorPunchResult(
          existingContractorPunch,
          'Attendance already recorded',
        );
      }
    }

    const resolved = await this.faceService.resolveFrames(dto.frames);
    const allGood = this.faceService.goodFrames(resolved);
    // Reduce to the group that will actually decide identity BEFORE evaluating
    // liveness. Evaluating liveness over every good frame let a single
    // server-resolved frame carry the trusted liveness score while the larger
    // device-only group — embeddings supplied by the client, and never
    // server-verified — determined whose punch was accepted. Liveness must be
    // proven by the same frames that establish identity.
    const good = this.faceService.selectComparableFrames(allGood);
    if (good.length === 0) {
      await this.failedAttemptService.recordFailed(
        clientId,
        branchId,
        deviceId,
        null,
        null,
        'NO_FACE',
      );
      return {
        status: 'REJECTED',
        message: 'Face not clear — please look at the camera',
      };
    }

    if (eff.livenessRequired) {
      const liveness = await this.liveness.evaluate({
        clientAsserted: dto.livenessPassed === true,
        serverScores: good.map((f) => f.serverLivenessScore ?? null),
      });
      if (!liveness.passed) {
        await this.failedAttemptService.recordFailed(
          clientId,
          branchId,
          deviceId,
          null,
          null,
          'LIVENESS_FAILED',
        );
        return {
          status: 'REJECTED',
          message: 'Liveness check failed — please blink',
        };
      }
    }

    const best3 = this.faceService.bestFrames(good, 3);
    const probe = averageEmbeddings(best3.map((f) => f.embedding));
    const probeModel = normalizeEmbeddingModel(best3[0]?.model ?? null);

    // BIOMETRIC_ONLY: this client punches on eSSL fingerprint readers, which
    // ingest through BiometricService on their own path. A face punch arriving
    // here means a kiosk is pointed at a client that does not use one, so
    // refuse it rather than quietly recording attendance by a method the
    // client has switched off.
    if (eff.identificationMode === 'BIOMETRIC_ONLY') {
      return {
        status: 'REJECTED',
        message: 'This site records attendance on the biometric device',
      };
    }

    // FACE_ONLY and FACE_THEN_BIOMETRIC both identify 1:N from the face, which
    // only Azure can answer safely — see FaceDeskFaceOnlyAttendanceService for
    // why the on-device matcher is never used for it. The difference is that
    // FACE_THEN_BIOMETRIC additionally wants a fingerprint punch to corroborate,
    // and flags the punch when none is found.
    if (
      eff.identificationMode === 'FACE_ONLY' ||
      eff.identificationMode === 'FACE_THEN_BIOMETRIC'
    ) {
      return this.faceOnlyAttendanceService.markByFace(
        clientId,
        branchId,
        deviceId,
        dto,
        best3,
        eff.identificationMode === 'FACE_THEN_BIOMETRIC',
      );
    }

    return this.pinAttendanceService.markByPin(
      clientId,
      branchId,
      deviceId,
      dto,
      eff,
      probe,
      probeModel,
      best3,
    );
  }

  async offlineSync(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    punches: MarkAttendanceDto[],
  ): Promise<{ synced: number; duplicateSkipped: number; failed: number }> {
    return this.offlineSyncService.offlineSync(
      clientId,
      branchId,
      deviceId,
      punches,
    );
  }

  async getStatus(clientId: string, employeeId: string) {
    const { start, end } = this.directionService.businessDayBoundsUtc(
      new Date(),
    );
    const rows = await this.attRepo
      .createQueryBuilder('a')
      .where('a.clientId = :clientId', { clientId })
      .andWhere('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.punchTime >= :start AND a.punchTime < :end', { start, end })
      .orderBy('a.punchTime', 'ASC')
      .getMany();
    return { employeeId, punches: rows.length, log: rows };
  }
}
