import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceService } from './compliance.service';
import { ComplianceTask } from './entities/compliance-task.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import { ComplianceMcdItem } from './entities/compliance-mcd-item.entity';
import { DocumentRemark } from './entities/document-remark.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { UserEntity } from '../users/entities/user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { ComplianceCronService } from './compliance-cron.service';
import { CrmComplianceTasksController } from './controllers/crm-compliance.controller';
import { ContractorComplianceController } from './controllers/contractor-compliance.controller';
import { ClientComplianceController } from './controllers/client-compliance.controller';
import { AdminComplianceController } from './controllers/admin-compliance.controller';
import { AuditorComplianceController } from './controllers/auditor-compliance.controller';
import { CommonComplianceController } from './controllers/common-compliance.controller';
import {
  ComplianceCrmDashboardController,
  ContractorDashboardController,
  ClientDashboardController,
  AdminRoleDashboardController,
  ComplianceAuditorDashboardController,
} from './controllers/dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceMasterEntity,
      ComplianceTask,
      ComplianceEvidence,
      ComplianceComment,
      ComplianceMcdItem,
      DocumentRemark,
      DocumentReuploadRequest,
      DocumentVersion,
      UserEntity,
      BranchEntity,
    ]),
    AssignmentsModule,
    UsersModule,
    NotificationsModule,
    EmailModule,
    AuthModule,
  ],
  controllers: [
    CrmComplianceTasksController,
    ContractorComplianceController,
    ClientComplianceController,
    AdminComplianceController,
    AuditorComplianceController,
    CommonComplianceController,
    ComplianceCrmDashboardController,
    ContractorDashboardController,
    ClientDashboardController,
    AdminRoleDashboardController,
    ComplianceAuditorDashboardController,
  ],
  providers: [ComplianceService, ComplianceCronService],
})
export class ComplianceModule {}
