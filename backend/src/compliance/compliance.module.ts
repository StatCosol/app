import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceService } from './compliance.service';
import { ComplianceTask } from './entities/compliance-task.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { UserEntity } from '../users/entities/user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { ComplianceCronService } from './compliance-cron.service';
import { CrmComplianceTasksController } from './controllers/crm-compliance.controller';
import { ContractorComplianceController } from './controllers/contractor-compliance.controller';
import { ClientComplianceController } from './controllers/client-compliance.controller';
import { AdminComplianceController } from './controllers/admin-compliance.controller';
import { AuditorComplianceController } from './controllers/auditor-compliance.controller';
import {
  CrmDashboardController,
  ContractorDashboardController,
  ClientDashboardController,
  AdminRoleDashboardController,
  AuditorDashboardController,
} from './controllers/dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceMasterEntity,
      ComplianceTask,
      ComplianceEvidence,
      ComplianceComment,
      UserEntity,
      BranchEntity,
    ]),
    AssignmentsModule,
    UsersModule,
    NotificationsModule,
    EmailModule,
  ],
  controllers: [
    CrmComplianceTasksController,
    ContractorComplianceController,
    ClientComplianceController,
    AdminComplianceController,
    AuditorComplianceController,
    CrmDashboardController,
    ContractorDashboardController,
    ClientDashboardController,
    AdminRoleDashboardController,
    AuditorDashboardController,
  ],
  providers: [ComplianceService, ComplianceCronService],
})
export class ComplianceModule {}
