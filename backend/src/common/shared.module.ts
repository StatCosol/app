import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompliancePctService } from './services/compliance-pct.service';
import { CompliancePctController } from './compliance-pct.controller';
import { DbService } from './db/db.service';
import { CronLoggerService } from './services/cron-logger.service';
import { ExcelExportService } from './services/excel-export.service';
import { CronExecutionLogEntity } from './entities/cron-execution-log.entity';

/**
 * SharedModule provides common, cross-cutting services that have no entity
 * dependencies (they use raw DataSource queries).
 *
 * Marked @Global so consumers don't need to import it explicitly.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CronExecutionLogEntity])],
  controllers: [CompliancePctController],
  providers: [
    CompliancePctService,
    DbService,
    CronLoggerService,
    ExcelExportService,
  ],
  exports: [
    CompliancePctService,
    DbService,
    CronLoggerService,
    ExcelExportService,
  ],
})
export class SharedModule {}
