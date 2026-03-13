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
import { PayrollTemplate } from '../payroll/entities/payroll-template.entity';
import { PayrollTemplateComponent } from '../payroll/entities/payroll-template-component.entity';
import { PayrollClientTemplate } from '../payroll/entities/payroll-client-template.entity';
import { PayrollClientSettings } from '../payroll/entities/payroll-client-settings.entity';
import { AdminPayrollClientSettingsController } from './admin-payroll-client-settings.controller';
import { AdminPayrollTemplatesController } from './admin-payroll-templates.controller';
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

@Module({
  imports: [
    NotificationsModule,
    EmailModule,
    AuditsModule,
    AuditLogsModule,
    BranchesModule,
    ListQueriesModule,
    TypeOrmModule.forFeature([
      PayrollTemplate,
      PayrollTemplateComponent,
      PayrollClientTemplate,
      PayrollClientSettings,
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
    AdminPayrollTemplatesController,
    AdminPayrollClientSettingsController,
    AdminMastersController,
    AdminApprovalsController,
    AdminActionsController,
    AdminAuditLogsController,
    AdminReportsController,
    AdminListController,
  ],
  providers: [
    AdminDigestService,
    AdminMastersService,
    AdminApprovalsService,
    AdminActionsService,
  ],
})
export class AdminModule {}
