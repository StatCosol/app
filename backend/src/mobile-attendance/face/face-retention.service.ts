import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { FacePhotoStorageService } from './face-photo-storage.service';

/**
 * DPDP-aligned biometric retention sweeps. Both are OPT-IN via env — unset
 * means no deletion, matching current behavior.
 *
 * FACE_PUNCH_PHOTO_RETENTION_DAYS
 *   Punch photos older than N days are deleted from storage and the
 *   photo_url cleared. Match audit numbers (scores/margins) are kept —
 *   only the biometric image is purged.
 *
 * FACE_EMBEDDING_RETENTION_AFTER_EXIT_DAYS
 *   Employees/contractors inactive for more than N days get their face
 *   enrollment deactivated and the embedding crypto-shredded (zeroed),
 *   and all extra templates deleted. Mirrors the manual deactivate flow.
 */
@Injectable()
export class FaceRetentionService {
  private readonly logger = new Logger(FaceRetentionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly photoStorage: FacePhotoStorageService,
  ) {}

  private get photoRetentionDays(): number | null {
    const v = process.env.FACE_PUNCH_PHOTO_RETENTION_DAYS;
    return v ? Math.max(1, Number(v)) : null;
  }

  private get embeddingRetentionAfterExitDays(): number | null {
    const v = process.env.FACE_EMBEDDING_RETENTION_AFTER_EXIT_DAYS;
    return v ? Math.max(1, Number(v)) : null;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runRetentionSweep(): Promise<void> {
    await this.purgeOldPunchPhotos().catch((err) =>
      this.logger.error(`photo retention sweep failed: ${err?.message}`),
    );
    await this.shredExitedEmbeddings().catch((err) =>
      this.logger.error(`embedding retention sweep failed: ${err?.message}`),
    );
  }

  async purgeOldPunchPhotos(): Promise<number> {
    const days = this.photoRetentionDays;
    if (!days) return 0;

    let purged = 0;
    for (const table of [
      'mobile_attendance_punches',
      'contractor_biometric_punches',
    ]) {
      const rows = await this.dataSource.query<
        Array<{ id: string; photo_url: string }>
      >(
        `SELECT id, photo_url FROM ${table}
          WHERE photo_url IS NOT NULL
            AND punch_time < now() - ($1 || ' days')::interval
          LIMIT 500`,
        [String(days)],
      );
      for (const row of rows) {
        await this.photoStorage.deletePhoto(row.photo_url);
        await this.dataSource.query(
          `UPDATE ${table} SET photo_url = NULL WHERE id = $1`,
          [row.id],
        );
        purged++;
      }
    }
    if (purged > 0) {
      this.logger.log(
        `retention: purged ${purged} punch photos older than ${days} days`,
      );
    }
    return purged;
  }

  async shredExitedEmbeddings(): Promise<number> {
    const days = this.embeddingRetentionAfterExitDays;
    if (!days) return 0;

    const interval = `${days} days`;
    const emp = await this.dataSource.query<Array<{ employee_id: string }>>(
      `UPDATE face_enrollments fe
          SET is_active = false,
              embedding = ''::bytea,
              deactivated_at = now(),
              deactivation_reason = 'RETENTION_AUTO_SHRED'
         FROM employees e
        WHERE e.id = fe.employee_id
          AND fe.is_active = true
          AND e.is_active = false
          AND COALESCE(e.date_of_exit::timestamptz, e.updated_at) < now() - $1::interval
        RETURNING fe.employee_id`,
      [interval],
    );
    const con = await this.dataSource.query<
      Array<{ contractor_employee_id: string }>
    >(
      `UPDATE contractor_face_enrollments cfe
          SET is_active = false,
              embedding = ''::bytea,
              deactivated_at = now(),
              deactivation_reason = 'RETENTION_AUTO_SHRED'
         FROM contractor_employees ce
        WHERE ce.id = cfe.contractor_employee_id
          AND cfe.is_active = true
          AND ce.is_active = false
          AND ce.updated_at < now() - $1::interval
        RETURNING cfe.contractor_employee_id`,
      [interval],
    );

    const empIds = emp.map((r) => r.employee_id);
    const conIds = con.map((r) => r.contractor_employee_id);
    if (empIds.length > 0) {
      await this.dataSource.query(
        `DELETE FROM face_enrollment_templates
          WHERE subject_type = 'EMPLOYEE' AND subject_id = ANY($1::uuid[])`,
        [empIds],
      );
    }
    if (conIds.length > 0) {
      await this.dataSource.query(
        `DELETE FROM face_enrollment_templates
          WHERE subject_type = 'CONTRACTOR' AND subject_id = ANY($1::uuid[])`,
        [conIds],
      );
    }

    const total = empIds.length + conIds.length;
    if (total > 0) {
      this.logger.log(
        `retention: crypto-shredded ${total} face enrollments (exited > ${days} days)`,
      );
    }
    return total;
  }
}
