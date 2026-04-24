import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { SystemTaskEntity } from './entities/system-task.entity';
import { AuditScheduleEntity } from './entities/audit-schedule.entity';
import { AuditEntity } from '../audits/entities/audit.entity';
import { AuditNonComplianceEntity } from '../audits/entities/audit-non-compliance.entity';
import { AuditDocumentReviewEntity } from '../audits/entities/audit-document-review.entity';
import { AuditResubmissionEntity } from '../audits/entities/audit-resubmission.entity';

// Module wiring
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';

// Engine services
import { TaskEngineService } from './services/task-engine.service';
import { NonComplianceEngineService } from './services/non-compliance-engine.service';
import { AuditOutputEngineService } from './services/audit-output-engine.service';
import { ApplicabilityEngineService } from './services/applicability-engine.service';
import { MonthlyCycleEngineService } from './services/monthly-cycle-engine.service';
import { AuditScheduleEngineService } from './services/audit-schedule-engine.service';
import { ExpiryEngineService } from './services/expiry-engine.service';
import { ExpiryTaskService } from './services/expiry-task.service';
import { AutomationNotificationService } from './services/automation-notification.service';
import { ReturnsFilingEngineService } from './services/returns-filing-engine.service';
import { RenewalFilingEngineService } from './services/renewal-filing-engine.service';

// Controllers
import { AuditScheduleAutomationController } from './controllers/audit-schedule-automation.controller';
import { ApplicabilityAutomationController } from './controllers/applicability-automation.controller';
import { CrmExpiryController } from './controllers/crm-expiry.controller';
import { BranchExpiryController } from './controllers/branch-expiry.controller';
import { ClientExpiryController } from './controllers/client-expiry.controller';
import { ReturnsFilingAutomationController } from './controllers/returns-filing-automation.controller';

// Cron jobs
import { NonComplianceRemindersJob } from './jobs/non-compliance-reminders.job';
import { MonthlyCycleOpenJob } from './jobs/monthly-cycle-open.job';
import { AuditScheduleGeneratorJob } from './jobs/audit-schedule-generator.job';
import { DueRemindersJob } from './jobs/due-reminders.job';
import { ExpiryRemindersJob } from './jobs/expiry-reminders.job';
import { ApplicabilityRecomputeJob } from './jobs/applicability-recompute.job';
import { ReturnsFilingGeneratorJob } from './jobs/returns-filing-generator.job';

// Sibling modules
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SystemTaskEntity,
      AuditScheduleEntity,
      AuditEntity,
      AuditNonComplianceEntity,
      AuditDocumentReviewEntity,
      AuditResubmissionEntity,
    ]),
    NotificationsModule,
    AuthModule,
  ],
  controllers: [
    AutomationController,
    AuditScheduleAutomationController,
    ApplicabilityAutomationController,
    CrmExpiryController,
    BranchExpiryController,
    ClientExpiryController,
    ReturnsFilingAutomationController,
  ],
  providers: [
    // Core
    AutomationService,

    // Engines
    TaskEngineService,
    NonComplianceEngineService,
    AuditOutputEngineService,
    ApplicabilityEngineService,
    MonthlyCycleEngineService,
    AuditScheduleEngineService,
    ExpiryEngineService,
    ExpiryTaskService,
    AutomationNotificationService,
    ReturnsFilingEngineService,
    RenewalFilingEngineService,

    // Cron jobs
    NonComplianceRemindersJob,
    MonthlyCycleOpenJob,
    AuditScheduleGeneratorJob,
    DueRemindersJob,
    ExpiryRemindersJob,
    ApplicabilityRecomputeJob,
    ReturnsFilingGeneratorJob,
  ],
  exports: [
    TaskEngineService,
    NonComplianceEngineService,
    AuditOutputEngineService,
    AuditScheduleEngineService,
    ApplicabilityEngineService,
    MonthlyCycleEngineService,
    ExpiryEngineService,
    ExpiryTaskService,
    AutomationNotificationService,
    ReturnsFilingEngineService,
    RenewalFilingEngineService,
  ],
})
export class AutomationModule {}
