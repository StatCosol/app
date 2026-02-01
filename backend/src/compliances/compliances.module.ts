import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceMasterEntity } from './entities/compliance-master.entity';
import { ComplianceApplicabilityEntity } from './entities/compliance-applicability.entity';
import { BranchComplianceEntity } from '../checklists/entities/branch-compliance.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { CompliancesController } from './compliances.controller';
import { CompliancesService } from './compliances.service';
import { CrmComplianceController } from './crm-compliance.controller';
import { ComplianceApplicabilityService } from './compliance-applicability.service';
import { BranchComplianceRecomputeController } from './branch-compliance-recompute.controller';
import { AssignmentsModule } from '../assignments/assignments.module';
import { BranchComplianceOverrideService } from './branch-compliance-override.service';
import { BranchComplianceOverrideController } from './branch-compliance-override.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceMasterEntity,
      ComplianceApplicabilityEntity,
      BranchComplianceEntity,
      BranchEntity,
    ]),
    AssignmentsModule,
    AuthModule,
  ],
  controllers: [
    CompliancesController,
    CrmComplianceController,
    BranchComplianceRecomputeController,
    BranchComplianceOverrideController,
  ],
  providers: [
    CompliancesService,
    ComplianceApplicabilityService,
    BranchComplianceOverrideService,
  ],
  exports: [
    CompliancesService,
    ComplianceApplicabilityService,
    BranchComplianceOverrideService,
    TypeOrmModule,
  ],
})
export class CompliancesModule {}
