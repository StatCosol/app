import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { FaceDeskFaceService } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { MarkAttendanceDto } from './facedesk.dto';

const BUSINESS_TZ_OFFSET_MIN = 330;

interface Candidate {
  employeeId: string;
  employeeCode: string;
  name: string;
  branchId: string | null;
  cosine: number;
}

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

  private async loadRoster(
    clientId: string,
    branchId: string | null,
  ): Promise<
    Array<{
      employeeId: string;
      employeeCode: string;
      name: string;
      branchId: string | null;
      template: Buffer;
      model: string | null;
    }>
  > {
    const params: unknown[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      params.push(branchId);
      branchFilter = `AND (p.branch_id = $2 OR p.branch_id IS NULL)`;
    }
    return this.dataSource.query(
      `SELECT p.employee_id AS "employeeId", e.employee_code AS "employeeCode",
              e.name AS "name", p.branch_id AS "branchId",
              p.face_template AS "template", p.embedding_model AS "model"
         FROM facedesk_employee_face_profiles p
         JOIN employees e ON e.id = p.employee_id AND e.client_id = p.client_id
        WHERE p.client_id = $1 AND p.enrollment_status = 'ENROLLED'
          AND p.face_template IS NOT NULL AND e.is_active = true
          ${branchFilter}`,
      params,
    );
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

    const roster = await this.loadRoster(clientId, branchId);
    const scored: Candidate[] = [];
    for (const r of roster) {
      if (!r.template || r.template.length === 0) continue;
      const rosterModel = normalizeEmbeddingModel(r.model);
      const rEmb = bufferToEmbedding(r.template);
      if (rEmb.length !== probe.length) continue;
      if (probeModel && rosterModel && probeModel !== rosterModel) continue;
      scored.push({
        employeeId: r.employeeId,
        employeeCode: r.employeeCode,
        name: r.name,
        branchId: r.branchId,
        cosine: this.faceService.cosine(probe, rEmb),
      });
    }
    scored.sort((a, b) => b.cosine - a.cosine);

    const best = scored[0];
    const second = scored[1];
    if (!best || best.cosine < eff.retryCosine) {
      await this.recordFailed(
        clientId,
        branchId,
        deviceId,
        best?.employeeId ?? null,
        best?.cosine ?? null,
        'NO_MATCH',
      );
      return { status: 'REJECTED', message: 'Face not recognized' };
    }

    const margin = second ? best.cosine - second.cosine : 1;
    const confidencePercent = this.settings.cosineToPercent(best.cosine);

    // Multiple close matches → human review.
    if (
      second &&
      second.cosine >= eff.retryCosine &&
      margin < eff.minMarginCosine
    ) {
      const failed = await this.recordFailed(
        clientId,
        branchId,
        deviceId,
        best.employeeId,
        best.cosine,
        'MULTIPLE_MATCH',
      );
      await this.reviewRepo.save({
        clientId,
        branchId,
        employeeId: best.employeeId,
        issueType: 'MULTIPLE_MATCH',
        confidenceScore: best.cosine,
        status: 'PENDING',
        adminRemarks: `best=${best.employeeCode} second=${second.employeeCode} margin=${margin.toFixed(3)} failedAttempt=${failed.attemptId}`,
      });
      return { status: 'REVIEW', message: 'Attendance held for review' };
    }

    // Retry band: recognizable but below the accept bar.
    if (best.cosine < eff.acceptCosine) {
      return {
        status: 'RETRY',
        message: 'Please look at the camera again',
        confidencePercent,
      };
    }

    // Accept.
    const punchTime = dto.punchTime ? new Date(dto.punchTime) : new Date();
    const punchType = await this.nextPunchType(
      clientId,
      best.employeeId,
      punchTime,
    );
    let photoUrl: string | null = null;
    if (dto.photoB64) {
      photoUrl = await this.photoStorage
        .uploadPhoto(dto.photoB64, clientId, best.employeeId)
        .catch(() => null);
    }
    const saved = await this.attRepo.save({
      employeeId: best.employeeId,
      clientId,
      branchId: best.branchId ?? branchId,
      deviceId,
      punchType,
      punchTime,
      confidenceScore: best.cosine,
      matchMargin: margin,
      livenessScore:
        best3.find((f) => f.livenessScore != null)?.livenessScore ?? null,
      photoUrl,
      attendanceStatus: 'MARKED',
      syncStatus: dto.offlineRef ? 'SYNCED' : 'SYNCED',
      offlineRef: dto.offlineRef ?? null,
    });

    return {
      status: 'MARKED',
      message: 'Attendance Marked Successfully',
      employeeName: best.name,
      employeeCode: best.employeeCode,
      punchType: saved.punchType,
      punchTime: saved.punchTime.toISOString(),
      branchId: saved.branchId,
      confidencePercent,
    };
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
