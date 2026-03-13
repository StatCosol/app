import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from './entities/branch.entity';
import { BranchContractorEntity } from './entities/branch-contractor.entity';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';
import { BranchDocumentEntity } from './entities/branch-document.entity';
import { BranchRegistrationEntity } from './entities/branch-registration.entity';
import { BranchesController } from './branches.controller';
import { BranchesCommonController } from './branches-common.controller';
import { BranchReportsController } from './branch-reports.controller';
import { CrmBranchesController } from './crm-branches.controller';
import { ClientBranchesController } from './client-branches.controller';
import { CrmBranchCompliancesController } from './crm-branch-compliances.controller';
import {
  ClientBranchDocumentsController,
  CrmBranchDocumentsController,
  CrmBranchRegistrationsController,
} from './branch-documents.controller';
import { BranchesService } from './branches.service';
import { BranchDocumentsService } from './branch-documents.service';
import { BranchRegistrationsService } from './branch-registrations.service';
import { ClientsModule } from '../clients/clients.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { CompliancesModule } from '../compliances/compliances.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ApprovalRequestEntity } from '../admin/entities/approval-request.entity';
import { RegistrationAlertEntity } from './entities/registration-alert.entity';
import { BranchRegistrationReminderService } from './branch-registration-reminder.service';
import { BranchListController } from './branch-list.controller';
import { BranchUploadsController } from './branch-uploads.controller';
import { EmailModule } from '../email/email.module';
import { ListQueriesModule } from '../list-queries/list-queries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchEntity,
      BranchContractorEntity,
      BranchApplicableComplianceEntity,
      BranchDocumentEntity,
      BranchRegistrationEntity,
      RegistrationAlertEntity,
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
    EmailModule,
    ListQueriesModule,
  ],
  controllers: [
    BranchesController,
    BranchesCommonController,
    CrmBranchesController,
    ClientBranchDocumentsController,
    ClientBranchesController,
    CrmBranchCompliancesController,
    CrmBranchDocumentsController,
    CrmBranchRegistrationsController,
    BranchReportsController,
    BranchListController,
    BranchUploadsController,
  ],
  providers: [
    BranchesService,
    BranchDocumentsService,
    BranchRegistrationsService,
    BranchRegistrationReminderService,
  ],
  exports: [BranchesService],
})
export class BranchesModule {}
