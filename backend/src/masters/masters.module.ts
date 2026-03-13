import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ThresholdMasterEntity,
  UnitComplianceMasterEntity,
  CompliancePackageEntity,
  PackageComplianceEntity,
  ApplicabilityRuleEntity,
  PackageRuleEntity,
} from './entities';
import { ThresholdResolverService } from './services/threshold-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ThresholdMasterEntity,
      UnitComplianceMasterEntity,
      CompliancePackageEntity,
      PackageComplianceEntity,
      ApplicabilityRuleEntity,
      PackageRuleEntity,
    ]),
  ],
  providers: [ThresholdResolverService],
  exports: [ThresholdResolverService, TypeOrmModule],
})
export class MastersModule {}
