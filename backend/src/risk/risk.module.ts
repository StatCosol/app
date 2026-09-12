import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { RiskSnapshotCronService } from './risk-snapshot-cron.service';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [AccessModule],
  controllers: [RiskController],
  providers: [RiskService, RiskSnapshotCronService],
  exports: [RiskService],
})
export class RiskModule {}
