import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

type AssignmentType = 'CRM' | 'AUDITOR';

@Injectable()
export class AssignmentRotationService {
  // Run both CRM and AUDITOR rotations manually
  async run() {
    const crm = await this.rotateNow('CRM');
    const auditor = await this.rotateNow('AUDITOR');
    return { crm, auditor };
  }
  private readonly logger = new Logger(AssignmentRotationService.name);

  constructor(private readonly ds: DataSource) {}

  // Daily at 01:00
  @Cron('0 0 1 * * *')
  async rotateCrmDaily(): Promise<void> {
    await this.rotateExpired('CRM', 365);
  }

  // Daily at 01:05
  @Cron('0 5 1 * * *')
  async rotateAuditorDaily(): Promise<void> {
    await this.rotateExpired('AUDITOR', 120);
  }

  async rotateNow(type: AssignmentType): Promise<{ rotated: number }> {
    const days = type === 'CRM' ? 365 : 120;
    const rotated = await this.rotateExpired(type, days);
    return { rotated };
  }

  private async rotateExpired(
    type: AssignmentType,
    durationDays: number,
  ): Promise<number> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Expired assignments: start_date older than duration, still active
      const expired: Array<{
        id: string;
        client_id: string;
        assigned_to_user_id: string | null;
        start_date: string;
      }> = await qr.query(
        `
        SELECT id, client_id, assigned_to_user_id, start_date
        FROM client_assignments_current
        WHERE assignment_type = $1
          AND start_date < (now() - ($2 || ' days')::interval)
        FOR UPDATE
        `,
        [type, durationDays],
      );

      if (!expired.length) {
        await qr.commitTransaction();
        return 0;
      }

      // Active assignees pool
      const roleCode = type === 'CRM' ? 'CRM' : 'AUDITOR';
      const assignees: Array<{ id: string }> = await qr.query(
        `
        SELECT u.id
        FROM users u
        JOIN roles r ON r.id = u."roleId"
        WHERE u."isActive" = true
          AND r.code = $1
        ORDER BY u."createdAt" ASC
        `,
        [roleCode],
      );

      if (!assignees.length) {
        this.logger.warn(`No active assignees found for ${type} rotation`);
        await qr.commitTransaction();
        return 0;
      }

      let rotated = 0;

      for (const row of expired) {
        const next = this.pickNextAssignee(
          assignees.map((a) => a.id),
          row.assigned_to_user_id,
        );

        // Close open history rows for this assignment
        await qr.query(
          `
          UPDATE client_assignment_history
          SET end_date = now()
          WHERE client_id = $1 AND assignment_type = $2 AND end_date IS NULL
          `,
          [row.client_id, type],
        );

        // Insert end-history for previous assignee
        if (row.assigned_to_user_id) {
          await qr.query(
            `
            INSERT INTO client_assignment_history
              (client_id, assignment_type, assigned_to_user_id, start_date, end_date, changed_by_user_id, change_reason)
            VALUES
              ($1, $2, $3, $4, now(), NULL, 'AUTO_ROTATE_END')
            `,
            [row.client_id, type, row.assigned_to_user_id, row.start_date],
          );
        }

        // Upsert new current assignment
        await qr.query(
          `
          INSERT INTO client_assignments_current
            (client_id, assignment_type, assigned_to_user_id, start_date, updated_at)
          VALUES
            ($1, $2, $3, now(), now())
          ON CONFLICT (client_id, assignment_type)
          DO UPDATE SET
            assigned_to_user_id = EXCLUDED.assigned_to_user_id,
            start_date = EXCLUDED.start_date,
            updated_at = now()
          `,
          [row.client_id, type, next],
        );

        // Insert start-history for new assignee
        await qr.query(
          `
          INSERT INTO client_assignment_history
            (client_id, assignment_type, assigned_to_user_id, start_date, end_date, changed_by_user_id, change_reason)
          VALUES
            ($1, $2, $3, now(), NULL, NULL, 'AUTO_ROTATE_START')
          `,
          [row.client_id, type, next],
        );

        rotated++;
      }

      await qr.commitTransaction();
      this.logger.log(`Rotated ${rotated} ${type} assignments`);
      return rotated;
    } catch (e) {
      await qr.rollbackTransaction();
      this.logger.error(`Rotation failed for ${type}`, e?.stack || String(e));
      throw e;
    } finally {
      await qr.release();
    }
  }

  private pickNextAssignee(
    pool: string[],
    currentAssigneeId: string | null,
  ): string {
    if (!pool.length)
      throw new BadRequestException('No assignee pool available');
    if (pool.length === 1) return pool[0];
    const idx = currentAssigneeId ? pool.indexOf(currentAssigneeId) : -1;
    if (idx === -1) return pool[0];
    return pool[(idx + 1) % pool.length];
  }
}
