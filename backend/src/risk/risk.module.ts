import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { RiskSnapshotCronService } from './risk-snapshot-cron.service';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [AssignmentsModule],
  controllers: [RiskController],
  providers: [RiskService, RiskSnapshotCronService],
  exports: [RiskService],
})
export class RiskModule {}
