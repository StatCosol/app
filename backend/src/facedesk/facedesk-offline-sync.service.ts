import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarkAttendanceDto } from './facedesk.dto';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { MarkResult } from './facedesk-attendance.service';

function dedupeKeyPresent(p: MarkAttendanceDto): boolean {
  return !!p.offlineRef;
}

export type OfflinePunchSyncStatus =
  | 'SYNCED'
  | 'DUPLICATE'
  | 'REVIEW'
  | 'DROPPED'
  | 'RETRY';

export interface OfflinePunchSyncResult {
  offlineRef: string | null;
  status: OfflinePunchSyncStatus;
  message?: string;
}

export interface OfflineSyncResponse {
  synced: number;
  duplicateSkipped: number;
  failed: number;
  results: OfflinePunchSyncResult[];
}

function classifyOfflineResult(
  res: MarkResult,
  hadOfflineRef: boolean,
): OfflinePunchSyncStatus {
  if (res.status === 'MARKED') {
    if (hadOfflineRef && res.message === 'Attendance already recorded') {
      return 'DUPLICATE';
    }
    if (/verification/i.test(res.message ?? '')) return 'REVIEW';
    return 'SYNCED';
  }
  // A queued offline punch replays FIXED frames, so a below-threshold match
  // (RETRY) is deterministic — it can never improve on a later run. Forwarding
  // it as retryable keeps the entry (and its stored PIN) on the kiosk queue
  // forever and inserts a failed-attempt row on every sync. It is therefore
  // TERMINAL during replay: dropped from the queue (a single failed attempt is
  // still logged server-side for audit). Interactive submissions keep RETRY —
  // they are marked directly and never flow through offline sync. Transient
  // network/5xx errors still retry via the caller's catch below.
  if (res.status === 'RETRY') return 'DROPPED';
  if (res.status === 'REVIEW') return 'REVIEW';
  return 'DROPPED';
}

/** Operational/transient failures should stay on the kiosk queue; 4xx rejections do not. */
function isTransientOfflineError(err: unknown): boolean {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    if (status === 408 || status === 429) return true;
    if (status >= 500) return true;
    return false;
  }
  return true;
}

@Injectable()
export class FaceDeskOfflineSyncService {
  private readonly logger = new Logger(FaceDeskOfflineSyncService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => FaceDeskAttendanceService))
    private readonly attendance: FaceDeskAttendanceService,
  ) {}

  /** Offline batch sync: mark each punch, dedupe by offlineRef, log the sync. */
  async offlineSync(
    clientId: string,
    branchId: string | null,
    deviceId: string | null,
    punches: MarkAttendanceDto[],
  ): Promise<OfflineSyncResponse> {
    let synced = 0;
    let duplicateSkipped = 0;
    let failed = 0;
    const results: OfflinePunchSyncResult[] = [];
    for (const p of punches ?? []) {
      const ref = p.offlineRef ?? null;
      try {
        const before = dedupeKeyPresent(p);
        const res = await this.attendance.markAttendance(
          clientId,
          branchId,
          deviceId,
          { ...p },
        );
        const status = classifyOfflineResult(res, before);
        results.push({ offlineRef: ref, status, message: res.message });
        switch (status) {
          case 'SYNCED':
            synced++;
            break;
          case 'DUPLICATE':
            duplicateSkipped++;
            break;
          case 'REVIEW':
            synced++;
            break;
          case 'RETRY':
            // Legacy kiosks (<0.7.3) clear the queue when failed == 0.
            failed++;
            break;
          default:
            failed++;
        }
      } catch (err) {
        const transient = isTransientOfflineError(err);
        const status: OfflinePunchSyncStatus = transient ? 'RETRY' : 'DROPPED';
        this.logger.warn(
          `offline punch ${status.toLowerCase()}: ${(err as Error)?.message}`,
        );
        results.push({
          offlineRef: ref,
          status,
          message: (err as Error)?.message,
        });
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
    return { synced, duplicateSkipped, failed, results };
  }
}
