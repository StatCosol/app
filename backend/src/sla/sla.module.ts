import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaTaskEntity } from './entities/sla-task.entity';
import { SlaController } from './sla.controller';
import { SlaService } from './sla.service';
import { SlaAutogenCronService } from './sla-autogen-cron.service';
import { CompliancesModule } from '../compliances/compliances.module';

@Module({
  imports: [TypeOrmModule.forFeature([SlaTaskEntity]), CompliancesModule],
  controllers: [SlaController],
  providers: [SlaService, SlaAutogenCronService],
  exports: [SlaService],
})
export class SlaModule {}
