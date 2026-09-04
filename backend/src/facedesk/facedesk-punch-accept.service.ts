import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  averageEmbeddings,
  embeddingToBuffer,
} from '../mobile-attendance/face/face-math';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import { BiometricService } from '../biometric/biometric.service';
import {
  FaceDeskAttendanceEntity,
  FaceDeskReviewQueueEntity,
} from './entities/facedesk.entities';
import { FaceDeskFaceService, ResolvedFrame } from './facedesk-face.service';
import { MarkAttendanceDto } from './facedesk.dto';
import { MarkResult } from './facedesk-attendance.service';
import { FaceDeskPunchDirectionService } from './facedesk-punch-direction.service';
import { FaceDeskFailedAttemptService } from './facedesk-failed-attempt.service';

const FACE_DESK_WEB_DEVICE_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class FaceDeskPunchAcceptService {
  private readonly logger = new Logger(FaceDeskPunchAcceptService.name);

  constructor(
    @InjectRepository(FaceDeskAttendanceEntity)
    private readonly attRepo: Repository<FaceDeskAttendanceEntity>,
    @InjectRepository(FaceDeskReviewQueueEntity)
    private readonly reviewRepo: Repository<FaceDeskReviewQueueEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly biometric: BiometricService,
    private readonly directionService: FaceDeskPunchDirectionService,
    private readonly failedAttemptService: FaceDeskFailedAttemptService,
    private readonly dataSource: DataSource,
  ) {}

  contractorPunchResult(
    punch: ContractorBiometricPunchEntity,
    message: string,
  ): MarkResult {
    return {
      status: 'MARKED',
      message,
      punchType: punch.direction === 'OUT' ? 'OUT' : 'IN',
      punchTime: punch.punchTime.toISOString(),
      branchId: punch.branchId,
    };
  }

  /**
   * Serialise everything this method does for one subject.
   *
   * The minimum-gap check reads the last punch and then, some way later, writes
   * a new one. Two kiosks submitting for the same person can both finish that
   * read before either write lands, so both pass the gap check and both are
   * recorded — the exact second-kiosk case the gap exists to prevent. A
   * time-based rule cannot be expressed as a unique constraint, so the read and
   * the write have to be held together.
   *
   * A Postgres advisory lock rather than a transaction: the writes below go
   * through several repositories on the pool's own connections, and threading a
   * transaction manager through all of them would be a far larger change to a
   * method that is being rewritten in parallel. An advisory lock is global to
   * the database, so it serialises regardless of which connection does the
   * insert.
   *
   * Keyed on client + subject, so it only ever blocks the same person punching
   * twice at once — never two different workers at the same gate.
   */
  private async withSubjectLock<T>(
    clientId: string,
    subjectId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SELECT pg_advisory_lock(hashtext($1), hashtext($2))', [
        clientId,
        subjectId,
      ]);
      return await fn();
    } finally {
      // Released even when the punch throws; the runner is released either way,
      // which drops any lock still held on that connection as a backstop.
      try {
        await runner.query(
          'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
          [clientId, subjectId],
        );
      } catch (err) {
        this.logger.warn(
          `advisory unlock failed: ${(err as Error)?.message ?? err}`,
        );
      }
      await runner.release();
    }
  }

  acceptPunch(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    employee: {
      employeeId: string;
      employeeCode: string;
      name: string;
      branchId: string | null;
      subjectType: 'EMPLOYEE' | 'CONTRACTOR';
    },
    cosine: number,
    margin: number,
    best3: ResolvedFrame[],
    confidencePercent: number,
    flagForReview = false,
    reviewIssue:
      | 'FACE_MISMATCH'
      | 'LOW_CONFIDENCE'
      | 'BIOMETRIC_MISSING' = 'FACE_MISMATCH',
    reviewRemarkOverride?: string,
  ): Promise<MarkResult> {
    return this.withSubjectLock(clientId, employee.employeeId, () =>
      this.acceptPunchSerialised(
        clientId,
        branchId,
        deviceId,
        dto,
        employee,
        cosine,
        margin,
        best3,
        confidencePercent,
        flagForReview,
        reviewIssue,
        reviewRemarkOverride,
      ),
    );
  }

  private async acceptPunchSerialised(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    employee: {
      employeeId: string;
      employeeCode: string;
      name: string;
      branchId: string | null;
      subjectType: 'EMPLOYEE' | 'CONTRACTOR';
    },
    cosine: number,
    margin: number,
    best3: ResolvedFrame[],
    confidencePercent: number,
    flagForReview = false,
    reviewIssue:
      | 'FACE_MISMATCH'
      | 'LOW_CONFIDENCE'
      // FACE_THEN_BIOMETRIC: the face identified, but no fingerprint punch
      // corroborated it inside the window.
      | 'BIOMETRIC_MISSING' = 'FACE_MISMATCH',
    reviewRemarkOverride?: string,
  ): Promise<MarkResult> {
    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();

    // Minimum gap between one punch and the next for the same subject.
    //
    // Punches alternate IN/OUT per business day, so a second capture moments
    // after the first is not read as a duplicate — it is read as the worker
    // leaving the instant they arrived, and the worked-hours report pairs the
    // two into a zero-length shift.
    //
    // The kiosk already holds capture for POST_PUNCH_HOLD_MS, but that is a
    // client-side timer and cannot see past its own screen: a worker who simply
    // stands there long enough, a second kiosk at the same gate, a device
    // restart, or an offline batch replaying all reach this method regardless.
    // This is the check that holds for all of them, because everything funnels
    // through acceptPunch.
    //
    // Refused rather than silently swallowed: the worker is told, instead of
    // walking away believing a punch was recorded that never was.
    const gapMinutes = Number(process.env.FD_MIN_PUNCH_GAP_MINUTES ?? 3);
    if (gapMinutes > 0) {
      const since = await this.directionService.minutesSinceLastPunch(
        clientId,
        employee.employeeId,
        employee.subjectType,
        punchTime,
      );
      if (since !== null && since < gapMinutes) {
        const wait = Math.max(1, Math.ceil(gapMinutes - since));
        return {
          status: 'REJECTED',
          message: `Attendance already recorded — please wait ${wait} more minute${
            wait === 1 ? '' : 's'
          }`,
        };
      }
    }

    const resolvedBranchId = employee.branchId ?? branchId;
    const livenessScore =
      best3.find((f) => f.livenessScore != null)?.livenessScore ?? null;
    const probeEmbedding = flagForReview
      ? embeddingToBuffer(averageEmbeddings(best3.map((f) => f.embedding)))
      : null;
    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.uploadPhotoWithRetry(
        dto.photoB64,
        clientId,
        employee.employeeId,
        flagForReview,
      );
    }
    const reviewBase = `PIN correct but face did not match (${confidencePercent}%).`;
    const reviewRemark =
      reviewRemarkOverride ??
      (photoUrl
        ? `${reviewBase} Verify the captured photo.`
        : `${reviewBase} ⚠ Captured photo unavailable — verify by other means.`);

    if (employee.subjectType === 'CONTRACTOR') {
      const direction = await this.directionService.nextContractorDirection(
        clientId,
        employee.employeeId,
        punchTime,
      );
      let savedContractorPunch: ContractorBiometricPunchEntity;
      try {
        savedContractorPunch = await this.contractorPunchRepo.save({
          clientId,
          branchId: resolvedBranchId,
          deviceId: deviceId ?? FACE_DESK_WEB_DEVICE_ID,
          contractorEmployeeId: employee.employeeId,
          direction,
          punchTime,
          matchCosine: cosine,
          matchMargin: margin,
          livenessScore,
          photoUrl,
          embeddingModel: best3[0]?.model ?? null,
          decision: flagForReview ? 'REVIEW_PENDING' : 'AUTO',
          offlineSync: !!dto.offlineRef,
          offlineRef: dto.offlineRef ?? null,
        });
      } catch (error: unknown) {
        if (dto.offlineRef && (error as { code?: string })?.code === '23505') {
          const existing = await this.contractorPunchRepo.findOne({
            where: { clientId, offlineRef: dto.offlineRef },
          });
          if (existing) {
            return this.contractorPunchResult(
              existing,
              'Attendance already recorded',
            );
          }
        }
        throw error;
      }

      if (flagForReview) {
        await this.reviewRepo.save({
          clientId,
          branchId: resolvedBranchId,
          employeeId: employee.employeeId,
          attendanceId: null,
          contractorPunchId: savedContractorPunch.id,
          issueType: reviewIssue,
          confidenceScore: cosine,
          status: 'PENDING',
          probeEmbedding,
          adminRemarks: reviewRemark,
        });
        await this.failedAttemptService.recordFailed(
          clientId,
          resolvedBranchId,
          deviceId,
          employee.employeeId,
          cosine,
          reviewIssue,
          photoUrl,
        );
      }
      return {
        status: 'MARKED',
        message: flagForReview
          ? 'Marked — pending branch verification'
          : 'Attendance Marked Successfully',
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        punchType: direction === 'OUT' ? 'OUT' : 'IN',
        punchTime: punchTime.toISOString(),
        branchId: resolvedBranchId,
        confidencePercent,
      };
    }

    const punchType = await this.directionService.nextPunchType(
      clientId,
      employee.employeeId,
      punchTime,
    );
    const saved = await this.attRepo.save({
      employeeId: employee.employeeId,
      clientId,
      branchId: resolvedBranchId,
      deviceId,
      punchType,
      punchTime,
      confidenceScore: cosine,
      matchMargin: margin,
      livenessScore,
      photoUrl,
      attendanceStatus: 'MARKED',
      syncStatus: 'SYNCED',
      offlineRef: dto.offlineRef ?? null,
    });

    if (flagForReview) {
      await this.reviewRepo.save({
        clientId,
        branchId: saved.branchId,
        employeeId: employee.employeeId,
        attendanceId: saved.attendanceId,
        issueType: reviewIssue,
        confidenceScore: cosine,
        status: 'PENDING',
        probeEmbedding,
        adminRemarks: reviewRemark,
      });
      await this.failedAttemptService.recordFailed(
        clientId,
        saved.branchId,
        deviceId,
        employee.employeeId,
        cosine,
        reviewIssue,
        photoUrl,
      );
    } else {
      await this.ingestEmployeePunch(clientId, {
        employeeCode: employee.employeeCode,
        punchTime: saved.punchTime,
        direction: saved.punchType,
        deviceId,
        branchId: saved.branchId,
      });
    }

    return {
      status: 'MARKED',
      message: flagForReview
        ? 'Marked — pending branch verification'
        : 'Attendance Marked Successfully',
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      punchType: saved.punchType,
      punchTime: saved.punchTime.toISOString(),
      branchId: saved.branchId,
      confidencePercent,
    };
  }

  private async ingestEmployeePunch(
    clientId: string,
    p: {
      employeeCode: string;
      punchTime: Date;
      direction: 'IN' | 'OUT';
      deviceId: string | null;
      branchId: string | null;
    },
  ): Promise<void> {
    if (!p.employeeCode) return;
    try {
      await this.biometric.ingest(
        clientId,
        [
          {
            employeeCode: p.employeeCode,
            punchTime: new Date(p.punchTime).toISOString(),
            direction: p.direction,
            deviceId: p.deviceId ?? 'facedesk',
            branchId: p.branchId ?? undefined,
            source: 'MOBILE_KIOSK',
          },
        ],
        true,
      );
    } catch (err) {
      this.logger.warn(
        `biometric ingest failed for ${p.employeeCode}: ${(err as Error)?.message}`,
      );
    }
  }

  private async uploadPhotoWithRetry(
    photoB64: string,
    clientId: string,
    employeeId: string,
    critical: boolean,
  ): Promise<string | null> {
    const attempts = critical ? 2 : 1;
    for (let i = 0; i < attempts; i++) {
      const url = await this.photoStorage
        .uploadPhoto(photoB64, clientId, employeeId)
        .catch(() => null);
      if (url) return url;
    }
    if (critical) {
      this.logger.warn(
        `flagged-punch photo upload failed for employee ${employeeId} (client ${clientId})`,
      );
    }
    return null;
  }
}
