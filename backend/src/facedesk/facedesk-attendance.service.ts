import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  averageEmbeddings,
  bufferToEmbedding,
  normalizeEmbeddingModel,
} from '../mobile-attendance/face/face-math';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import {
  FaceDeskAttendanceEntity,
  FaceDeskFailedAttemptEntity,
  FaceDeskReviewQueueEntity,
} from './entities/facedesk.entities';
import { FaceDeskFaceService, ResolvedFrame } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { MarkAttendanceDto } from './facedesk.dto';

const BUSINESS_TZ_OFFSET_MIN = 330;

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
  private readonly logger = new Logger(FaceDeskAttendanceService.name);

  constructor(
    @InjectRepository(FaceDeskAttendanceEntity)
    private readonly attRepo: Repository<FaceDeskAttendanceEntity>,
    @InjectRepository(FaceDeskFailedAttemptEntity)
    private readonly failRepo: Repository<FaceDeskFailedAttemptEntity>,
    @InjectRepository(FaceDeskReviewQueueEntity)
    private readonly reviewRepo: Repository<FaceDeskReviewQueueEntity>,
    private readonly faceService: FaceDeskFaceService,
    private readonly settings: FaceDeskSettingsService,
    private readonly photoStorage: FacePhotoStorageService,
    private readonly dataSource: DataSource,
  ) {}

  private businessDayBoundsUtc(d: Date): { start: Date; end: Date } {
    const offsetMs = BUSINESS_TZ_OFFSET_MIN * 60 * 1000;
    const local = new Date(d.getTime() + offsetMs);
    const startLocalUtcMs = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    );
    const start = new Date(startLocalUtcMs - offsetMs);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  private async nextPunchType(
    clientId: string,
    employeeId: string,
    at: Date,
  ): Promise<'IN' | 'OUT'> {
    const { start, end } = this.businessDayBoundsUtc(at);
    const [row] = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::int AS n FROM facedesk_attendance_logs
        WHERE client_id = $1 AND employee_id = $2
          AND punch_time >= $3 AND punch_time < $4
          AND attendance_status IN ('MARKED','APPROVED')`,
      [clientId, employeeId, start, end],
    );
    return Number(row?.n ?? 0) % 2 === 0 ? 'IN' : 'OUT';
  }

  async markAttendance(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
  ): Promise<MarkResult> {
    const eff = await this.settings.getEffective(clientId);

    // Offline dedupe: same client + offlineRef already recorded → idempotent OK.
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
    }

    const resolved = await this.faceService.resolveFrames(dto.frames);
    const good = this.faceService.goodFrames(resolved);
    if (good.length === 0) {
      await this.recordFailed(
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
      const livenessOk =
        dto.livenessPassed === true ||
        good.some((f) => (f.livenessScore ?? 0) >= 0.5);
      if (!livenessOk) {
        await this.recordFailed(
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

    // PIN + 1:1 face verification is mandatory for EVERY FaceDesk punch —
    // live and offline sync alike. A punch without code + PIN can't be
    // trusted: an old face-only APK, or a direct submission to the
    // offline-sync endpoint, could otherwise omit credentials and bypass the
    // PIN requirement indefinitely. markByPin rejects a credential-less punch
    // (PIN_MISSING), so the legacy 1:N face-only path is gone entirely.
    return this.markByPin(
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

  /** Persist an accepted punch (shared by the PIN accept + mismatch-flag paths). */
  private async acceptPunch(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    employee: {
      employeeId: string;
      employeeCode: string;
      name: string;
      branchId: string | null;
    },
    cosine: number,
    margin: number,
    best3: ResolvedFrame[],
    confidencePercent: number,
    flagForReview = false,
  ): Promise<MarkResult> {
    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();
    const punchType = await this.nextPunchType(
      clientId,
      employee.employeeId,
      punchTime,
    );
    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage
        .uploadPhoto(dto.photoB64, clientId, employee.employeeId)
        .catch(() => null);
    }
    const saved = await this.attRepo.save({
      employeeId: employee.employeeId,
      clientId,
      branchId: employee.branchId ?? branchId,
      deviceId,
      punchType,
      punchTime,
      confidenceScore: cosine,
      matchMargin: margin,
      livenessScore:
        best3.find((f) => f.livenessScore != null)?.livenessScore ?? null,
      photoUrl,
      // Counts immediately; a flagged punch is reversible on branch rejection.
      attendanceStatus: 'MARKED',
      syncStatus: 'SYNCED',
      offlineRef: dto.offlineRef ?? null,
    });

    // PIN correct but face didn't match → mark, but queue for the branch to
    // verify the captured photo and approve or reverse it.
    if (flagForReview) {
      await this.reviewRepo.save({
        clientId,
        branchId: saved.branchId,
        employeeId: employee.employeeId,
        attendanceId: saved.attendanceId,
        issueType: 'FACE_MISMATCH',
        confidenceScore: cosine,
        status: 'PENDING',
        adminRemarks: `PIN correct but face did not match (${confidencePercent}%). Verify the captured photo.`,
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

  /** Load the single claimed employee's profile for PIN 1:1 verification. */
  private async loadClaimedProfile(
    clientId: string,
    branchId: string | null,
    employeeCode: string,
  ): Promise<{
    employeeId: string;
    employeeCode: string;
    name: string;
    branchId: string | null;
    template: Buffer | null;
    model: string | null;
    pinHash: string | null;
  } | null> {
    const params: unknown[] = [clientId, employeeCode];
    let branchFilter = '';
    if (branchId) {
      params.push(branchId);
      branchFilter = `AND (p.branch_id = $3 OR p.branch_id IS NULL)`;
    }
    const [row] = await this.dataSource.query(
      `SELECT p.employee_id AS "employeeId", e.employee_code AS "employeeCode",
              e.name AS "name", p.branch_id AS "branchId",
              p.face_template AS "template", p.embedding_model AS "model",
              p.attendance_pin_hash AS "pinHash"
         FROM facedesk_employee_face_profiles p
         JOIN employees e ON e.id = p.employee_id AND e.client_id = p.client_id
        WHERE p.client_id = $1 AND e.employee_code = $2
          AND p.enrollment_status = 'ENROLLED'
          AND e.is_active = true
          ${branchFilter}
        LIMIT 1`,
      params,
    );
    return row ?? null;
  }

  /** PIN_THEN_FACE 1:1: verify the entered PIN, then match the face to that one template. */
  private async markByPin(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    dto: MarkAttendanceDto,
    eff: { acceptCosine: number; retryCosine: number },
    probe: Float32Array,
    probeModel: string | null,
    best3: ResolvedFrame[],
  ): Promise<MarkResult> {
    const code = (dto.employeeCode ?? '').trim();
    const pin = (dto.pin ?? '').trim();
    if (!code || !pin) {
      await this.recordFailed(clientId, branchId, deviceId, null, null, 'PIN_MISSING');
      return { status: 'REJECTED', message: 'Enter your employee code and PIN' };
    }

    const claimed = await this.loadClaimedProfile(clientId, branchId, code);
    if (!claimed || !claimed.template || claimed.template.length === 0) {
      await this.recordFailed(clientId, branchId, deviceId, null, null, 'UNKNOWN_CODE');
      return { status: 'REJECTED', message: 'Employee code not recognized' };
    }
    if (!claimed.pinHash) {
      return {
        status: 'REJECTED',
        message: 'No PIN set for this employee — contact your admin',
      };
    }

    const pinOk = await bcrypt.compare(pin, claimed.pinHash);
    if (!pinOk) {
      await this.recordFailed(
        clientId,
        branchId,
        deviceId,
        claimed.employeeId,
        null,
        'WRONG_PIN',
      );
      return { status: 'REJECTED', message: 'Incorrect PIN' };
    }

    const claimedModel = normalizeEmbeddingModel(claimed.model);
    if (probeModel && claimedModel && probeModel !== claimedModel) {
      return {
        status: 'REJECTED',
        message: 'Face model mismatch — please re-enroll',
      };
    }

    const cosine = this.faceService.cosine(
      probe,
      bufferToEmbedding(claimed.template),
    );
    const confidencePercent = this.settings.cosineToPercent(cosine);

    // Correct PIN but the face doesn't match. Per policy, mark the punch
    // (it counts immediately) but flag it so the branch verifies the photo
    // and can reverse it — this catches buddy-punching without blocking a
    // genuine employee the model failed to match.
    if (cosine < eff.retryCosine) {
      return this.acceptPunch(
        clientId,
        branchId,
        deviceId,
        dto,
        {
          employeeId: claimed.employeeId,
          employeeCode: claimed.employeeCode,
          name: claimed.name,
          branchId: claimed.branchId,
        },
        cosine,
        1,
        best3,
        confidencePercent,
        true, // flag for branch verification
      );
    }
    if (cosine < eff.acceptCosine) {
      return {
        status: 'RETRY',
        message: 'Please look at the camera again',
        confidencePercent,
      };
    }

    return this.acceptPunch(
      clientId,
      branchId,
      deviceId,
      dto,
      {
        employeeId: claimed.employeeId,
        employeeCode: claimed.employeeCode,
        name: claimed.name,
        branchId: claimed.branchId,
      },
      cosine,
      1,
      best3,
      confidencePercent,
    );
  }

  private async recordFailed(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    bestEmployeeId: string | null,
    bestConfidence: number | null,
    reason: string,
  ): Promise<FaceDeskFailedAttemptEntity> {
    return this.failRepo.save({
      clientId,
      branchId,
      deviceId,
      bestEmployeeId,
      bestConfidence,
      reason,
    });
  }

  /** Offline batch sync: mark each punch, dedupe by offlineRef, log the sync. */
  async offlineSync(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    punches: MarkAttendanceDto[],
  ): Promise<{ synced: number; duplicateSkipped: number; failed: number }> {
    let synced = 0;
    let duplicateSkipped = 0;
    let failed = 0;
    for (const p of punches ?? []) {
      try {
        const before = dedupeKeyPresent(p);
        const res = await this.markAttendance(clientId, branchId, deviceId, {
          ...p,
        });
        if (res.status === 'MARKED') {
          if (before && res.message === 'Attendance already recorded')
            duplicateSkipped++;
          else synced++;
        } else {
          failed++;
        }
      } catch (err) {
        this.logger.warn(`offline punch failed: ${(err as Error)?.message}`);
        failed++;
      }
    }
    if (deviceId) {
      await this.dataSource.query(
        `INSERT INTO facedesk_device_sync_logs
           (device_id, client_id, synced_count, duplicate_skipped, failed_count, sync_status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          deviceId,
          clientId,
          synced,
          duplicateSkipped,
          failed,
          failed === 0 ? 'OK' : synced > 0 ? 'PARTIAL' : 'FAILED',
        ],
      );
      await this.dataSource.query(
        `UPDATE facedesk_kiosk_devices SET last_sync_time = now(), device_status = 'ONLINE' WHERE device_id = $1`,
        [deviceId],
      );
    }
    return { synced, duplicateSkipped, failed };
  }

  async getStatus(clientId: string, employeeId: string) {
    const { start, end } = this.businessDayBoundsUtc(new Date());
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

function dedupeKeyPresent(p: MarkAttendanceDto): boolean {
  return !!p.offlineRef;
}
