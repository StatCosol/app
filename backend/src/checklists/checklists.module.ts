import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchComplianceEntity } from './entities/branch-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ComplianceApplicabilityEntity } from '../compliances/entities/compliance-applicability.entity';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchComplianceEntity,
      ComplianceMasterEntity,
      ComplianceApplicabilityEntity,
    ]),
  ],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
