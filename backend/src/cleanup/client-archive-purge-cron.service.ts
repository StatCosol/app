import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Permanently deletes `client_deletion_archive` rows whose `purge_after`
 * timestamp has elapsed (default retention: 18 months / 548 days from the
 * client soft-delete moment).
 *
 * Runs daily at 4:00 AM, after RetentionCleanupCronService (3:30 AM).
 */
@Injectable()
export class ClientArchivePurgeCronService {
  private readonly logger = new Logger(ClientArchivePurgeCronService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('0 0 4 * * *') // 04:00 daily
  async handlePurge(): Promise<void> {
    this.logger.log('Starting client_deletion_archive purge…');
    try {
      const result = await this.dataSource.query(
        `DELETE FROM client_deletion_archive
          WHERE purged = false
            AND purge_after < NOW()
          RETURNING id`,
      );
      const purged = Array.isArray(result?.[0])
        ? result[0].length
        : (result?.[1] ?? 0);
      this.logger.log(
        `client_deletion_archive purge complete — removed ${purged} expired snapshot(s).`,
      );
    } catch (err: any) {
      // Table may not exist yet on a freshly-cloned dev environment.
      this.logger.error(
        `client_deletion_archive purge failed: ${err?.message || err}`,
      );
    }
  }
}
