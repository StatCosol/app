import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AeUnitEntity } from './entities/ae-unit.entity';
import { AeUnitFactsEntity } from './entities/ae-unit-facts.entity';
import { AeActMasterEntity } from './entities/ae-act-master.entity';
import { AeUnitActEntity } from './entities/ae-unit-act.entity';
import { AeUnitActProfileEntity } from './entities/ae-unit-act-profile.entity';
import { AeLabourCodeEntity } from './entities/ae-labour-code.entity';
import { AeComplianceMasterEntity } from './entities/ae-compliance-master.entity';
import { AePackageMasterEntity } from './entities/ae-package-master.entity';
import { AePackageItemEntity } from './entities/ae-package-item.entity';
import { AeActPackageMapEntity } from './entities/ae-act-package-map.entity';
import { AeRuleMasterEntity } from './entities/ae-rule-master.entity';
import { AeRuleConditionEntity } from './entities/ae-rule-condition.entity';
import { AeUnitComplianceEntity } from './entities/ae-unit-compliance.entity';
import { AeUnitComplianceOverrideEntity } from './entities/ae-unit-compliance-override.entity';
import { AeUnitTaskEntity } from './entities/ae-unit-task.entity';

import { ApplicabilityController } from './applicability.controller';
import { UnitActsController } from './unit-acts.controller';
import { ApplicabilityEngineService } from './engine/applicability-engine.service';
import { TaskGeneratorService } from './engine/task-generator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AeUnitEntity,
      AeUnitFactsEntity,
      AeActMasterEntity,
      AeUnitActEntity,
      AeUnitActProfileEntity,
      AeLabourCodeEntity,
      AeComplianceMasterEntity,
      AePackageMasterEntity,
      AePackageItemEntity,
      AeActPackageMapEntity,
      AeRuleMasterEntity,
      AeRuleConditionEntity,
      AeUnitComplianceEntity,
      AeUnitComplianceOverrideEntity,
      AeUnitTaskEntity,
    ]),
  ],
  controllers: [ApplicabilityController, UnitActsController],
  providers: [ApplicabilityEngineService, TaskGeneratorService],
  exports: [ApplicabilityEngineService],
})
export class ApplicabilityModule {}
