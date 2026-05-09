import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDashboardController } from '../dashboard/admin-dashboard.controller';
import { AdminDigestService } from './admin-digest.service';
import { AdminDigestController } from './admin-digest.controller';
import { AdminActionsService } from './admin-actions.service';
import { AdminActionsController } from './admin-actions.controller';
import { AdminReportsController } from './admin-reports.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

import { AdminMastersController } from './admin-masters.controller';
import { AdminMastersService } from './admin-masters.service';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { AuditsModule } from '../audits/audits.module';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';
import { ApprovalRequestEntity } from './entities/approval-request.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from '../assignments/entities/client-assignment-history.entity';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminListController } from './admin-list.controller';
import { BranchesModule } from '../branches/branches.module';
import { ListQueriesModule } from '../list-queries/list-queries.module';
import { MastersModule } from '../masters/masters.module';
import { AdminApplicabilityConfigController } from './admin-applicability-config.controller';
import { AdminApplicabilityConfigService } from './admin-applicability-config.service';

@Module({
  imports: [
    NotificationsModule,
    EmailModule,
    AuditsModule,
    AuditLogsModule,
    BranchesModule,
    ListQueriesModule,
    MastersModule,
    TypeOrmModule.forFeature([
      ComplianceMasterEntity,
      ApprovalRequestEntity,
      ClientAssignmentCurrentEntity,
      ClientAssignmentHistoryEntity,
      NotificationEntity,
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminDigestController,
    AdminMastersController,
    AdminApprovalsController,
    AdminActionsController,
    AdminAuditLogsController,
    AdminReportsController,
    AdminListController,
    AdminApplicabilityConfigController,
  ],
  providers: [
    AdminDigestService,
    AdminMastersService,
    AdminApprovalsService,
    AdminActionsService,
    AdminApplicabilityConfigService,
  ],
})
export class AdminModule {}
