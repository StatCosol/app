import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CcoController } from './cco.controller';
import { CcoListController } from './cco-list.controller';
import { CcoControlsController } from './cco-controls.controller';
import { CcoService } from './cco.service';
import { CcoControlsService } from './cco-controls.service';
import { CcoSlaRuleEntity } from './entities/cco-sla-rule.entity';
import { CcoEscalationThresholdEntity } from './entities/cco-escalation-threshold.entity';
import { CcoReminderRuleEntity } from './entities/cco-reminder-rule.entity';
import { ListQueriesModule } from '../list-queries/list-queries.module';

@Module({
  imports: [
    ListQueriesModule,
    TypeOrmModule.forFeature([
      CcoSlaRuleEntity,
      CcoEscalationThresholdEntity,
      CcoReminderRuleEntity,
    ]),
  ],
  controllers: [CcoController, CcoListController, CcoControlsController],
  providers: [CcoService, CcoControlsService],
})
export class CcoModule {}
