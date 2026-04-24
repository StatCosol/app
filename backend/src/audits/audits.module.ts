import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationCategoryEntity } from './entities/audit-observation-category.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditResubmissionEntity } from './entities/audit-resubmission.entity';
import { AuditsService } from './audits.service';
import {
  AuditorAuditsController,
  AuditorAuditsLegacyController,
  CrmAuditsController,
  ClientAuditsController,
  AuditKpiController,
  ContractorAuditsController,
  ContractorAuditNcController,
  BranchAuditNcController,
} from './audits.controller';
import { AuditorObservationsController } from './auditor-observations.controller';
import { AuditorObservationsService } from './auditor-observations.service';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditEntity,
      AuditObservationCategoryEntity,
      AuditObservationEntity,
      AuditChecklistItemEntity,
      AuditDocumentReviewEntity,
      AuditNonComplianceEntity,
      AuditResubmissionEntity,
    ]),
    ClientsModule,
    UsersModule,
    AssignmentsModule,
    AuthModule,
    AiModule,
    NotificationsModule,
    forwardRef(() => AutomationModule),
  ],
  controllers: [
    // Register the static KPI routes before the legacy /audits/:id alias.
    AuditKpiController,
    CrmAuditsController,
    AuditorAuditsController,
    AuditorAuditsLegacyController,
    ClientAuditsController,
    ContractorAuditsController,
    ContractorAuditNcController,
    BranchAuditNcController,
    AuditorObservationsController,
  ],
  providers: [AuditsService, AuditorObservationsService],
  exports: [TypeOrmModule, AuditsService],
})
export class AuditsModule {}
