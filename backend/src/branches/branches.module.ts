import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from './entities/branch.entity';
import { BranchContractorEntity } from './entities/branch-contractor.entity';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';
import { BranchesController } from './branches.controller';
import { CrmBranchesController } from './crm-branches.controller';
import { ClientBranchesController } from './client-branches.controller';
import { CrmBranchCompliancesController } from './crm-branch-compliances.controller';
import { BranchesService } from './branches.service';
import { ClientsModule } from '../clients/clients.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { CompliancesModule } from '../compliances/compliances.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchEntity,
      BranchContractorEntity,
      BranchApplicableComplianceEntity,
      ComplianceMasterEntity,
    ]),
    ClientsModule,
    ChecklistsModule,
    UsersModule,
    AssignmentsModule,
    CompliancesModule,
    AuditLogsModule,
  ],
  controllers: [
    BranchesController,
    CrmBranchesController,
    ClientBranchesController,        // ✅ was missing
    CrmBranchCompliancesController,  // ✅ was missing
  ],
  providers: [BranchesService],
  exports: [
    BranchesService, // ✅ needed by Contractor module (ClientContractorsController DI)
  ],
})
export class BranchesModule {}
