import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EscalationEntity } from './entities/escalation.entity';
import { EscalationsController } from './escalations.controller';
import { EscalationsService } from './escalations.service';
import { EscalationCronService } from './escalation-cron.service';
import { RiskModule } from '../risk/risk.module';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [TypeOrmModule.forFeature([EscalationEntity]), RiskModule, AccessModule],
  controllers: [EscalationsController],
  providers: [EscalationsService, EscalationCronService],
  exports: [EscalationsService],
})
export class EscalationsModule {}
