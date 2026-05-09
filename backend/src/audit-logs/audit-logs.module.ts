import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { TaskApprovalHistoryEntity } from './entities/task-approval-history.entity';
import { AuditLogsService } from './audit-logs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogEntity, TaskApprovalHistoryEntity]),
  ],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
