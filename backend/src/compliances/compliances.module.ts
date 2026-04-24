import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceMasterEntity } from './entities/compliance-master.entity';
import { ComplianceApplicabilityEntity } from './entities/compliance-applicability.entity';
import { SlaComplianceItemEntity } from './entities/compliance-item.entity';
import { SlaComplianceRuleEntity } from './entities/compliance-rule.entity';
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
import { SlaComplianceResolverService } from './sla-compliance-resolver.service';
import { SlaComplianceScheduleService } from './sla-compliance-schedule.service';
import { BranchComplianceController } from './branch-compliance.controller';
import { ComplianceMetricsService } from './compliance-metrics.service';
import { ComplianceMetricsController } from './compliance-metrics.controller';
import { ComplianceDocumentEntity } from '../branch-compliance/entities/compliance-document.entity';
import { SlaTaskEntity } from '../sla/entities/sla-task.entity';
import { BranchRegistrationEntity } from '../branches/entities/branch-registration.entity';
import { RiskMonitorCronService } from './risk-monitor-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EscalationsModule } from '../escalations/escalations.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceMasterEntity,
      ComplianceApplicabilityEntity,
      SlaComplianceItemEntity,
      SlaComplianceRuleEntity,
      BranchComplianceEntity,
      BranchEntity,
      ComplianceDocumentEntity,
      SlaTaskEntity,
      BranchRegistrationEntity,
    ]),
    AssignmentsModule,
    AuthModule,
    NotificationsModule,
    EscalationsModule,
    EmailModule,
  ],
  controllers: [
    CompliancesController,
    CrmComplianceController,
    BranchComplianceRecomputeController,
    BranchComplianceOverrideController,
    BranchComplianceController,
    ComplianceMetricsController,
  ],
  providers: [
    CompliancesService,
    ComplianceApplicabilityService,
    BranchComplianceOverrideService,
    SlaComplianceResolverService,
    SlaComplianceScheduleService,
    ComplianceMetricsService,
    RiskMonitorCronService,
  ],
  exports: [
    CompliancesService,
    ComplianceApplicabilityService,
    BranchComplianceOverrideService,
    SlaComplianceResolverService,
    SlaComplianceScheduleService,
    ComplianceMetricsService,
    TypeOrmModule,
  ],
})
export class CompliancesModule {}
