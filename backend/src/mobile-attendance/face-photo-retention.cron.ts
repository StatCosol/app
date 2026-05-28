import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CronLockService } from '../common/services/cron-lock.service';
import { FacePhotoStorage } from './face-photo-storage.service';

/**
 * Phase 4c / DPDP Act 2023: face-photo retention enforcement.
 *
 * Two retention windows (env-tunable):
 *   - FACE_PUNCH_PHOTO_RETENTION_DAYS  (default 90)  — selfies stored
 *     against `biometric_punches.photo_url` and
 *     `contractor_biometric_punches.photo_url`.
 *   - FACE_ENROLL_PHOTO_RETENTION_DAYS (default 365) — selfies stored
 *     against `face_enrollments.photo_url` and
 *     `contractor_face_enrollments.photo_url`. Kept longer because they
 *     are the consented reference image; admins still need them to
 *     re-verify a disputed punch within the typical legal review window.
 *
 * The job is idempotent (re-deleting an already-purged blob is a no-op)
 * and is wrapped in a PG advisory lock so concurrent app replicas can
 * never double-process the same row batch.
 */
@Injectable()
export class FacePhotoRetentionCron {
  private readonly logger = new Logger(FacePhotoRetentionCron.name);

  constructor(
    private readonly ds: DataSource,
    private readonly facePhotos: FacePhotoStorage,
    private readonly cronLock: CronLockService,
  ) {}

  // 03:30 IST daily, off-peak.
  @Cron('0 30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async run(): Promise<void> {
    if (!this.facePhotos.isEnabled()) return;
    await this.cronLock.runExclusive('face-photo:retention', async () => {
      try {
        const punchDays = this.daysFromEnv(
          'FACE_PUNCH_PHOTO_RETENTION_DAYS',
          90,
        );
        const enrollDays = this.daysFromEnv(
          'FACE_ENROLL_PHOTO_RETENTION_DAYS',
          365,
        );
        const punched = await this.purgePhotos({
          table: 'biometric_punches',
          pkCol: 'id',
          timeCol: 'punch_time',
          days: punchDays,
        });
        const cpunched = await this.purgePhotos({
          table: 'contractor_biometric_punches',
          pkCol: 'id',
          timeCol: 'punch_time',
          days: punchDays,
        });
        const enrolled = await this.purgePhotos({
          table: 'face_enrollments',
          pkCol: 'employee_id',
          timeCol: 'enrolled_at',
          days: enrollDays,
        });
        const cenrolled = await this.purgePhotos({
          table: 'contractor_face_enrollments',
          pkCol: 'contractor_employee_id',
          timeCol: 'enrolled_at',
          days: enrollDays,
        });
        this.logger.log(
          `face-photo retention: punches=${punched + cpunched} ` +
            `enrolls=${enrolled + cenrolled} ` +
            `(punchDays=${punchDays} enrollDays=${enrollDays})`,
        );
      } catch (err) {
        this.logger.error(
          'face-photo retention failed',
          err instanceof Error ? err.stack : String(err),
        );
      }
    });
  }

  // 03:15 IST daily — purge expired liveness nonces. Lightweight, but
  // kept on its own lock key so a stuck photo-retention run doesn't
  // block table cleanup.
  @Cron('0 15 3 * * *', { timeZone: 'Asia/Kolkata' })
  async runLivenessNonceCleanup(): Promise<void> {
    await this.cronLock.runExclusive('face-nonce:cleanup', async () => {
      try {
        const res = await this.ds.query(
          `DELETE FROM face_liveness_nonces
            WHERE expires_at < NOW() - INTERVAL '1 hour'
               OR (consumed_at IS NOT NULL
                   AND consumed_at < NOW() - INTERVAL '7 days')`,
        );
        const deleted = Array.isArray(res) ? 0 : (res?.rowCount ?? 0);
        if (deleted > 0) {
          this.logger.log(`face-nonce cleanup: deleted=${deleted}`);
        }
      } catch (err) {
        this.logger.error(
          'face-nonce cleanup failed',
          err instanceof Error ? err.stack : String(err),
        );
      }
    });
  }

  /**
   * Phase 4c / DPDP: weekly VACUUM on the face-enrollment tables so the
   * tuples left behind by crypto-shred (overwrite-with-random + UPDATE
   * isActive=false) are actually reclaimed instead of lingering in the
   * heap until the next autovacuum cycle. Plain VACUUM does NOT take an
   * ACCESS EXCLUSIVE lock so this is safe to run while traffic is live.
   *
   * Sunday 04:00 IST is chosen because:
   *  - Off-peak (no attendance punches expected).
   *  - After the daily 03:30 retention pass, so the freshly purged rows
   *    are also reclaimed.
   */
  @Cron('0 0 4 * * 0', { timeZone: 'Asia/Kolkata' })
  async runEmbeddingVacuum(): Promise<void> {
    await this.cronLock.runExclusive('face-embed:vacuum', async () => {
      const tables = [
        'face_enrollments',
        'contractor_face_enrollments',
        'face_liveness_nonces',
      ];
      for (const t of tables) {
        try {
          // VACUUM cannot run inside a transaction block; TypeORM's
          // `query` opens one implicitly. Use a fresh connection.
          await this.ds.manager.connection.query(`VACUUM ${t}`);
        } catch (err) {
          this.logger.error(
            `vacuum ${t} failed`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
      this.logger.log(
        `face-embed vacuum complete: tables=${tables.join(',')}`,
      );
    });
  }

  private daysFromEnv(key: string, def: number): number {
    const raw = Number(process.env[key]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : def;
  }

  /** Deletes the blob/file then nulls the photo_url column. Batched to
   *  cap memory + DB pressure when a backlog accumulates. Uses the
   *  table's natural PK (not ctid) so concurrent autovacuum cannot
   *  cause us to null a different row by mistake. */
  private async purgePhotos(opts: {
    table: string;
    pkCol: string;
    timeCol: string;
    days: number;
  }): Promise<number> {
    // Hard-cap the identifier set to a known-safe whitelist. Defence in
    // depth: callers above pass only literal identifiers, but if a future
    // caller ever passes user data the LIKE check throws before SQL is
    // built.
    const ALLOWED = /^[a-z_][a-z0-9_]*$/;
    if (
      !ALLOWED.test(opts.table) ||
      !ALLOWED.test(opts.pkCol) ||
      !ALLOWED.test(opts.timeCol)
    ) {
      throw new Error(
        `unsafe identifier passed to purgePhotos: ${JSON.stringify(opts)}`,
      );
    }
    if (!Number.isInteger(opts.days) || opts.days <= 0) {
      throw new Error(`invalid retention days: ${opts.days}`);
    }
    const batch = 200;
    let total = 0;
    while (true) {
      const rows: Array<{ pk: string; photo_url: string }> =
        await this.ds.query(
          `SELECT ${opts.pkCol} AS pk, photo_url FROM ${opts.table}
          WHERE photo_url IS NOT NULL
            AND ${opts.timeCol} < NOW() - ($1 || ' days')::interval
          LIMIT $2`,
          [String(opts.days), batch],
        );
      if (rows.length === 0) break;
      for (const r of rows) {
        await this.facePhotos.remove(r.photo_url);
      }
      await this.ds.query(
        `UPDATE ${opts.table} SET photo_url = NULL
          WHERE ${opts.pkCol} = ANY($1::uuid[])
            AND photo_url IS NOT NULL`,
        [rows.map((r) => r.pk)],
      );
      total += rows.length;
      if (rows.length < batch) break;
    }
    return total;
  }
}
