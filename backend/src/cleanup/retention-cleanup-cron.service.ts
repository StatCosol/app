import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Retention cleanup cron — permanently removes soft-deleted records
 * that are older than 3 years (1095 days).
 *
 * Runs daily at 3:30 AM.
 *
 * Affected tables:
 *  - clients            (deleted_at)
 *  - client_branches    (deletedat)
 *  - users              (deleted_at)  — client users & contractors
 *  - deletion_requests  — resolved requests older than 3 years
 */
@Injectable()
export class RetentionCleanupCronService {
  private readonly logger = new Logger(RetentionCleanupCronService.name);
  private static readonly RETENTION_DAYS = 1095; // 3 years

  constructor(private readonly dataSource: DataSource) {}

  @Cron('0 30 3 * * *') // 3:30 AM daily
  async handleRetentionCleanup() {
    this.logger.log('Starting 3-year retention cleanup...');

    const retentionDays = RetentionCleanupCronService.RETENTION_DAYS;

    try {
      // 1. Remove branch_contractor links for purged branches (before branch purge)
      const bcResult = await this.dataSource.query(
        `DELETE FROM branch_contractor
         WHERE branch_id IN (
           SELECT id FROM client_branches WHERE isdeleted = true AND deletedat < NOW() - make_interval(days => $1)
         )`,
        [retentionDays],
      );
      this.logger.log(`Purged ${bcResult?.[1] ?? 0} branch_contractor records`);

      // 2. Remove user_branches links for purged branches
      const ubResult = await this.dataSource.query(
        `DELETE FROM user_branches
         WHERE branch_id IN (
           SELECT id FROM client_branches WHERE isdeleted = true AND deletedat < NOW() - make_interval(days => $1)
         )`,
        [retentionDays],
      );
      this.logger.log(`Purged ${ubResult?.[1] ?? 0} user_branches records`);

      // 3. Purge soft-deleted branches older than 3 years
      const branchResult = await this.dataSource.query(
        `DELETE FROM client_branches WHERE isdeleted = true AND deletedat < NOW() - make_interval(days => $1)`,
        [retentionDays],
      );
      this.logger.log(
        `Purged ${branchResult?.[1] ?? 0} client_branches records`,
      );

      // 4. Purge client_users for purged clients
      const cuResult = await this.dataSource.query(
        `DELETE FROM client_users
         WHERE client_id IN (
           SELECT id FROM clients WHERE is_deleted = true AND deleted_at < NOW() - make_interval(days => $1)
         )`,
        [retentionDays],
      );
      this.logger.log(`Purged ${cuResult?.[1] ?? 0} client_users records`);

      // 5. Purge soft-deleted clients older than 3 years
      const clientResult = await this.dataSource.query(
        `DELETE FROM clients WHERE is_deleted = true AND deleted_at < NOW() - make_interval(days => $1)`,
        [retentionDays],
      );
      this.logger.log(`Purged ${clientResult?.[1] ?? 0} clients records`);

      // 6. Purge soft-deleted users (client users & contractors) older than 3 years
      const userResult = await this.dataSource.query(
        `DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - make_interval(days => $1)`,
        [retentionDays],
      );
      this.logger.log(`Purged ${userResult?.[1] ?? 0} users records`);

      // 7. Purge resolved deletion_requests older than 3 years
      const drResult = await this.dataSource.query(
        `DELETE FROM deletion_requests
         WHERE status IN ('APPROVED', 'REJECTED')
           AND updated_at < NOW() - make_interval(days => $1)`,
        [retentionDays],
      );
      this.logger.log(`Purged ${drResult?.[1] ?? 0} deletion_requests records`);

      this.logger.log('Retention cleanup complete.');
    } catch (err) {
      this.logger.error('Retention cleanup failed', err);
    }
  }
}
