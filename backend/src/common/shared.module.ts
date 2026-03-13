import { Global, Module } from '@nestjs/common';
import { CompliancePctService } from './services/compliance-pct.service';
import { CompliancePctController } from './compliance-pct.controller';
import { DbService } from './db/db.service';
import { CronLoggerService } from './services/cron-logger.service';

/**
 * SharedModule provides common, cross-cutting services that have no entity
 * dependencies (they use raw DataSource queries).
 *
 * Marked @Global so consumers don't need to import it explicitly.
 */
@Global()
@Module({
  controllers: [CompliancePctController],
  providers: [CompliancePctService, DbService, CronLoggerService],
  exports: [CompliancePctService, DbService, CronLoggerService],
})
export class SharedModule {}
