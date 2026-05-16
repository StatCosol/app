import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Daily detector that scans the last N hours of face_failed_scan_logs and
 * emits a single compliance_notification_center entry per (client, branch)
 * whose failure count crosses FACE_FAIL_ALERT_THRESHOLD (default 20).
 * De-duped by skipping branches that already received the same alert within
 * the dedupe window.
 *
 * Env overrides:
 *   FACE_FAIL_ALERT_THRESHOLD     (default 20)
 *   FACE_FAIL_ALERT_WINDOW_HOURS  (default 24)
 *   FACE_FAIL_ALERT_DEDUPE_HOURS  (default 20)
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

  private getWindowHours(): number {
    const raw = process.env.FACE_FAIL_ALERT_WINDOW_HOURS;
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) return 24;
    return Math.min(Math.floor(n), 24 * 30);
  }

  private getDedupeHours(): number {
    const raw = process.env.FACE_FAIL_ALERT_DEDUPE_HOURS;
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n < 0) return 20;
    return Math.min(Math.floor(n), 24 * 30);
  }

  // 06:00 IST every day.
  @Cron('0 0 6 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyDetector(): Promise<void> {
    await this.runDetector();
  }

  /**
   * Public entry point so admins can trigger the detector on demand (e.g.
   * after backfilling logs or tweaking the threshold). Returns a summary
   * instead of just logging it. All overrides are clamped to safe ranges.
   */
  async runDetector(overrides?: {
    threshold?: number;
    windowHours?: number;
    dedupeHours?: number;
  }): Promise<{
    threshold: number;
    windowHours: number;
    dedupeHours: number;
    candidates: number;
    emitted: number;
    skipped: number;
  }> {
    const threshold = clampInt(overrides?.threshold, 1, 100000, this.getThreshold());
    const windowHours = clampInt(overrides?.windowHours, 1, 24 * 30, this.getWindowHours());
    const dedupeHours = clampInt(overrides?.dedupeHours, 0, 24 * 30, this.getDedupeHours());
    try {
      // Per-client override via clients.face_fail_alert_threshold (nullable).
      // When NULL, the global env-derived threshold ($1) applies.
      const rows = (await this.dataSource.query(
        `SELECT f.client_id                                      AS "clientId",
                f.branch_id                                      AS "branchId",
                COUNT(*)::int                                    AS "count",
                MAX(f.attempted_at)                              AS "lastAt",
                COALESCE(c.face_fail_alert_threshold, $1)::int   AS "effectiveThreshold"
           FROM face_failed_scan_logs f
           JOIN clients c ON c.id = f.client_id
          WHERE f.attempted_at >= NOW() - ($2 || ' hours')::interval
            AND f.client_id IS NOT NULL
          GROUP BY f.client_id, f.branch_id, c.face_fail_alert_threshold
         HAVING COUNT(*) >= COALESCE(c.face_fail_alert_threshold, $1)`,
        [threshold, String(windowHours)],
      )) as Array<{
        clientId: string;
        branchId: string | null;
        count: number;
        lastAt: Date;
        effectiveThreshold: number;
      }>;

      if (!rows.length) {
        this.logger.log(
          `face-failure detector: no (client,branch) crossed threshold=${threshold} window=${windowHours}h`,
        );
        return {
          threshold,
          windowHours,
          dedupeHours,
          candidates: 0,
          emitted: 0,
          skipped: 0,
        };
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
              AND "createdAt" >= NOW() - ($3 || ' hours')::interval
            LIMIT 1`,
          [r.clientId, r.branchId, String(dedupeHours)],
        )) as Array<unknown>;
        if (dup.length) {
          skipped++;
          continue;
        }

        const effThreshold = Number(r.effectiveThreshold) || threshold;
        const title = `Face scan failures spike (${r.count} in ${windowHours}h)`;
        const message =
          `${r.count} face-scan failures were recorded in the last ${windowHours} hours` +
          (r.branchId ? ' for this branch' : ' across all branches') +
          `. Threshold: ${effThreshold}` +
          (effThreshold !== threshold ? ' (per-client override)' : '') +
          `. Review the Face Failures dashboard to investigate top offenders and reasons.`;

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
        `face-failure detector: threshold=${threshold} window=${windowHours}h dedupe=${dedupeHours}h candidates=${rows.length} emitted=${emitted} skipped=${skipped}`,
      );
      return {
        threshold,
        windowHours,
        dedupeHours,
        candidates: rows.length,
        emitted,
        skipped,
      };
    } catch (err: any) {
      this.logger.error(
        `face-failure detector failed: ${err?.message ?? err}`,
        err?.stack,
      );
      return {
        threshold,
        windowHours,
        dedupeHours,
        candidates: 0,
        emitted: 0,
        skipped: 0,
      };
    }
  }
}

function clampInt(
  raw: number | string | undefined | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
