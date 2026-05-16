import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Daily detector that scans the last 24h of face_failed_scan_logs and emits
 * a single compliance_notification_center entry per (client, branch) whose
 * failure count crosses FACE_FAIL_ALERT_THRESHOLD (default 20). De-duped by
 * skipping branches that already received the same alert in the last 20h.
 */
@Injectable()
export class FaceFailureAlertCronService {
  private readonly logger = new Logger(FaceFailureAlertCronService.name);

  constructor(private readonly dataSource: DataSource) {}

  private getThreshold(): number {
    const raw = process.env.FACE_FAIL_ALERT_THRESHOLD;
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) return 20;
    return Math.floor(n);
  }

  // 06:00 IST every day.
  @Cron('0 0 6 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyDetector(): Promise<void> {
    const threshold = this.getThreshold();
    try {
      const rows = (await this.dataSource.query(
        `SELECT client_id              AS "clientId",
                branch_id              AS "branchId",
                COUNT(*)::int          AS "count",
                MAX(attempted_at)      AS "lastAt"
           FROM face_failed_scan_logs
          WHERE attempted_at >= NOW() - INTERVAL '24 hours'
            AND client_id IS NOT NULL
          GROUP BY client_id, branch_id
         HAVING COUNT(*) >= $1`,
        [threshold],
      )) as Array<{
        clientId: string;
        branchId: string | null;
        count: number;
        lastAt: Date;
      }>;

      if (!rows.length) {
        this.logger.log(
          `face-failure detector: no (client,branch) crossed threshold=${threshold}`,
        );
        return;
      }

      let emitted = 0;
      let skipped = 0;
      for (const r of rows) {
        const dup = (await this.dataSource.query(
          `SELECT 1
             FROM compliance_notification_center
            WHERE "clientId" = $1
              AND (("branchId" IS NULL AND $2::uuid IS NULL) OR "branchId" = $2)
              AND module = 'ATTENDANCE'
              AND title LIKE 'Face scan failures spike%'
              AND "createdAt" >= NOW() - INTERVAL '20 hours'
            LIMIT 1`,
          [r.clientId, r.branchId],
        )) as Array<unknown>;
        if (dup.length) {
          skipped++;
          continue;
        }

        const title = `Face scan failures spike (${r.count} in 24h)`;
        const message =
          `${r.count} face-scan failures were recorded in the last 24 hours` +
          (r.branchId ? ' for this branch' : ' across all branches') +
          `. Threshold: ${threshold}. Review the Face Failures dashboard to investigate top offenders and reasons.`;

        await this.dataSource.query(
          `INSERT INTO compliance_notification_center
             ("clientId", "branchId", role, module, title, message,
              priority, "entityType")
           VALUES ($1, $2, 'CLIENT', 'ATTENDANCE', $3, $4, 'HIGH', 'FACE_FAILURE')`,
          [r.clientId, r.branchId, title, message],
        );
        emitted++;
      }

      this.logger.log(
        `face-failure detector: threshold=${threshold} candidates=${rows.length} emitted=${emitted} skipped=${skipped}`,
      );
    } catch (err: any) {
      this.logger.error(
        `face-failure detector failed: ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
