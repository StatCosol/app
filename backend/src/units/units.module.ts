import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MastersModule } from '../masters/masters.module';
import {
  UnitFactsEntity,
  UnitApplicableComplianceEntity,
  UnitApplicabilityAuditEntity,
} from './entities';
import { UnitsFactsService } from './services/units-facts.service';
import { RuleEvaluatorService } from './services/rule-evaluator.service';
import { ApplicabilityEngineService } from './services/applicability-engine.service';
import { UnitApplicabilityService } from './services/unit-applicability.service';
import { UnitsController } from './units.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UnitFactsEntity,
      UnitApplicableComplianceEntity,
      UnitApplicabilityAuditEntity,
    ]),
    MastersModule,
  ],
  controllers: [UnitsController],
  providers: [
    UnitsFactsService,
    RuleEvaluatorService,
    ApplicabilityEngineService,
    UnitApplicabilityService,
  ],
  exports: [UnitsFactsService],
})
export class UnitsModule {}
