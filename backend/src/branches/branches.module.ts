import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from './entities/branch.entity';
import { BranchContractorEntity } from './entities/branch-contractor.entity';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';
import { BranchDocumentEntity } from './entities/branch-document.entity';
import { BranchesController } from './branches.controller';
import { BranchesCommonController } from './branches-common.controller';
import { CrmBranchesController } from './crm-branches.controller';
import { ClientBranchesController } from './client-branches.controller';
import { CrmBranchCompliancesController } from './crm-branch-compliances.controller';
import {
  ClientBranchDocumentsController,
  CrmBranchDocumentsController,
} from './branch-documents.controller';
import { BranchesService } from './branches.service';
import { BranchDocumentsService } from './branch-documents.service';
import { ClientsModule } from '../clients/clients.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { CompliancesModule } from '../compliances/compliances.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ApprovalRequestEntity } from '../admin/entities/approval-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchEntity,
      BranchContractorEntity,
      BranchApplicableComplianceEntity,
      BranchDocumentEntity,
      ComplianceMasterEntity,
      ApprovalRequestEntity,
    ]),
    ClientsModule,
    ChecklistsModule,
    UsersModule,
    AssignmentsModule,
    CompliancesModule,
    AuditLogsModule,
    AuthModule,
  ],
  controllers: [
    BranchesController,
    BranchesCommonController,
    CrmBranchesController,
    ClientBranchesController,
    CrmBranchCompliancesController,
    ClientBranchDocumentsController,
    CrmBranchDocumentsController,
  ],
  providers: [BranchesService, BranchDocumentsService],
  exports: [BranchesService],
})
export class BranchesModule {}
