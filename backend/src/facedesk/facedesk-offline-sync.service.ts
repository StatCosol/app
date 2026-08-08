import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MarkAttendanceDto } from './facedesk.dto';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';

function dedupeKeyPresent(p: MarkAttendanceDto): boolean {
  return !!p.offlineRef;
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
  ): Promise<{ synced: number; duplicateSkipped: number; failed: number }> {
    let synced = 0;
    let duplicateSkipped = 0;
    let failed = 0;
    for (const p of punches ?? []) {
      try {
        const before = dedupeKeyPresent(p);
        const res = await this.attendance.markAttendance(clientId, branchId, deviceId, {
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
}
