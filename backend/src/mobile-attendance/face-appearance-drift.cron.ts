import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CronLockService } from '../common/services/cron-lock.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Roadmap #14 — aging / appearance-change handling.
 *
 * Nightly job that watches per-employee match-score trends. When an
 * active enrollment's rolling-window AVG(match_score) slips below
 * FACE_DRIFT_THRESHOLD (default 0.78, vs the per-punch acceptance
 * threshold of 0.70), we flag the enrollment and raise a system
 * notification asking the client admin to request a re-enrollment.
 *
 * Dedup: once flagged, we won't re-alert for the same enrollment within
 * FACE_DRIFT_REALERT_DAYS (default 30) unless the average has dropped
 * by at least FACE_DRIFT_REALERT_DELTA (default 0.05) since the prior
 * flag — that way a steadily-deteriorating face still surfaces.
 */
@Injectable()
export class FaceAppearanceDriftCron {
  private readonly logger = new Logger(FaceAppearanceDriftCron.name);

  constructor(
    private readonly ds: DataSource,
    private readonly cronLock: CronLockService,
    private readonly notifications: NotificationsService,
  ) {}

  // 04:00 IST daily — runs after the photo-retention job (03:30) so
  // the two read-heavy passes don't interleave.
  @Cron('0 0 4 * * *', { timeZone: 'Asia/Kolkata' })
  async run(): Promise<void> {
    await this.cronLock.runExclusive('face-appearance-drift', async () => {
      try {
        const windowDays = numEnv('FACE_DRIFT_WINDOW_DAYS', 30);
        const minSamples = numEnv('FACE_DRIFT_MIN_SAMPLES', 10);
        const threshold = floatEnv('FACE_DRIFT_THRESHOLD', 0.78);
        const realertDays = numEnv('FACE_DRIFT_REALERT_DAYS', 30);
        const realertDelta = floatEnv('FACE_DRIFT_REALERT_DELTA', 0.05);

        const emp = await this.scanInHouse(
          windowDays,
          minSamples,
          threshold,
          realertDays,
          realertDelta,
        );
        const ctr = await this.scanContractor(
          windowDays,
          minSamples,
          threshold,
          realertDays,
          realertDelta,
        );
        if (emp + ctr > 0) {
          this.logger.log(
            `appearance-drift: flagged employees=${emp} contractors=${ctr} ` +
              `(window=${windowDays}d minSamples=${minSamples} thr=${threshold})`,
          );
        }
      } catch (err) {
        this.logger.error(
          'appearance-drift cron failed',
          err instanceof Error ? err.stack : String(err),
        );
      }
    });
  }

  private async scanInHouse(
    windowDays: number,
    minSamples: number,
    threshold: number,
    realertDays: number,
    realertDelta: number,
  ): Promise<number> {
    const rows: Array<{
      employee_id: string;
      client_id: string;
      branch_id: string | null;
      employee_code: string | null;
      display_name: string | null;
      avg_score: string;
      sample_count: string;
      prior_avg: string | null;
      prior_flagged_at: string | null;
    }> = await this.ds.query(
      `WITH stats AS (
         SELECT bp.employee_id,
                AVG(bp.match_score)::numeric AS avg_score,
                COUNT(*)::int AS sample_count
           FROM biometric_punches bp
          WHERE bp.match_score IS NOT NULL
            AND bp.employee_id IS NOT NULL
            AND bp.punch_time >= NOW() - ($1 || ' days')::interval
          GROUP BY bp.employee_id
         HAVING COUNT(*) >= $2
       )
       SELECT fe.employee_id,
              fe.client_id,
              fe.branch_id,
              e.employee_code,
              COALESCE(NULLIF(TRIM(e.name), ''), e.employee_code) AS display_name,
              s.avg_score,
              s.sample_count,
              fe.appearance_drift_avg_score AS prior_avg,
              fe.appearance_drift_flagged_at AS prior_flagged_at
         FROM stats s
         JOIN face_enrollments fe ON fe.employee_id = s.employee_id
         JOIN employees e ON e.id = fe.employee_id
        WHERE fe.is_active = TRUE
          AND s.avg_score < $3`,
      [String(windowDays), minSamples, threshold],
    );
    let flagged = 0;
    for (const r of rows) {
      const avg = Number(r.avg_score);
      const priorAvg = r.prior_avg == null ? null : Number(r.prior_avg);
      const priorFlaggedAt = r.prior_flagged_at
        ? new Date(r.prior_flagged_at)
        : null;
      if (
        !this.shouldAlert(
          avg,
          priorAvg,
          priorFlaggedAt,
          realertDays,
          realertDelta,
        )
      ) {
        continue;
      }
      await this.ds.query(
        `UPDATE face_enrollments
            SET appearance_drift_flagged_at = NOW(),
                appearance_drift_avg_score = $2,
                appearance_drift_sample_count = $3
          WHERE employee_id = $1`,
        [r.employee_id, avg, Number(r.sample_count)],
      );
      const label =
        r.display_name || r.employee_code || r.employee_id.slice(0, 8);
      await this.notifications.createSystemNotification({
        clientId: r.client_id,
        branchId: r.branch_id ?? undefined,
        sourceKey: `face-drift:emp:${r.employee_id}:${new Date().toISOString().slice(0, 10)}`,
        subject: `Face match score declining: ${label}`,
        message:
          `Average face-match score for ${label} has fallen to ${avg.toFixed(3)} ` +
          `over the last ${r.sample_count} punches (window ${windowDays} days). ` +
          `Consider asking the employee to re-enroll their face to keep ` +
          `attendance verification reliable.`,
        queryType: 'ATTENDANCE',
        priority: 2,
      });
      flagged++;
    }
    return flagged;
  }

  private async scanContractor(
    windowDays: number,
    minSamples: number,
    threshold: number,
    realertDays: number,
    realertDelta: number,
  ): Promise<number> {
    const rows: Array<{
      contractor_employee_id: string;
      client_id: string;
      branch_id: string | null;
      display_name: string | null;
      avg_score: string;
      sample_count: string;
      prior_avg: string | null;
      prior_flagged_at: string | null;
    }> = await this.ds.query(
      `WITH stats AS (
         SELECT cbp.contractor_employee_id,
                AVG(cbp.match_score)::numeric AS avg_score,
                COUNT(*)::int AS sample_count
           FROM contractor_biometric_punches cbp
          WHERE cbp.match_score IS NOT NULL
            AND cbp.punch_time >= NOW() - ($1 || ' days')::interval
          GROUP BY cbp.contractor_employee_id
         HAVING COUNT(*) >= $2
       )
       SELECT cfe.contractor_employee_id,
              cfe.client_id,
              cfe.branch_id,
              ce.name AS display_name,
              s.avg_score,
              s.sample_count,
              cfe.appearance_drift_avg_score AS prior_avg,
              cfe.appearance_drift_flagged_at AS prior_flagged_at
         FROM stats s
         JOIN contractor_face_enrollments cfe
           ON cfe.contractor_employee_id = s.contractor_employee_id
         JOIN contractor_employees ce ON ce.id = cfe.contractor_employee_id
        WHERE cfe.is_active = TRUE
          AND s.avg_score < $3`,
      [String(windowDays), minSamples, threshold],
    );
    let flagged = 0;
    for (const r of rows) {
      const avg = Number(r.avg_score);
      const priorAvg = r.prior_avg == null ? null : Number(r.prior_avg);
      const priorFlaggedAt = r.prior_flagged_at
        ? new Date(r.prior_flagged_at)
        : null;
      if (
        !this.shouldAlert(
          avg,
          priorAvg,
          priorFlaggedAt,
          realertDays,
          realertDelta,
        )
      ) {
        continue;
      }
      await this.ds.query(
        `UPDATE contractor_face_enrollments
            SET appearance_drift_flagged_at = NOW(),
                appearance_drift_avg_score = $2,
                appearance_drift_sample_count = $3
          WHERE contractor_employee_id = $1`,
        [r.contractor_employee_id, avg, Number(r.sample_count)],
      );
      const label =
        r.display_name || `contractor ${r.contractor_employee_id.slice(0, 8)}`;
      await this.notifications.createSystemNotification({
        clientId: r.client_id,
        branchId: r.branch_id ?? undefined,
        sourceKey: `face-drift:ctr:${r.contractor_employee_id}:${new Date().toISOString().slice(0, 10)}`,
        subject: `Face match score declining (contractor): ${label}`,
        message:
          `Average face-match score for contractor ${label} has fallen to ` +
          `${avg.toFixed(3)} over the last ${r.sample_count} punches ` +
          `(window ${windowDays} days). Consider requesting a re-enroll.`,
        queryType: 'ATTENDANCE',
        priority: 2,
      });
      flagged++;
    }
    return flagged;
  }

  private shouldAlert(
    avg: number,
    priorAvg: number | null,
    priorFlaggedAt: Date | null,
    realertDays: number,
    realertDelta: number,
  ): boolean {
    if (!priorFlaggedAt) return true;
    const ageMs = Date.now() - priorFlaggedAt.getTime();
    if (ageMs >= realertDays * 24 * 60 * 60 * 1000) return true;
    if (priorAvg != null && priorAvg - avg >= realertDelta) return true;
    return false;
  }
}

function numEnv(key: string, def: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : def;
}
function floatEnv(key: string, def: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? raw : def;
}
