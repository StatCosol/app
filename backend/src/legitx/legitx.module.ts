import { AssistRecallGuard } from './assist-recall.guard';
import { AccessModule } from '../access/access.module';
import { ComplianceDocumentsModule } from '../compliance-documents/compliance-documents.module';
import { PayrollModule } from '../payroll/payroll.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LegitxAssistantDocumentsService } from './legitx-assistant-documents.service';
import { ServiceEntitlementsModule } from '../service-entitlements/service-entitlements.module';
import { AuditsModule } from '../audits/audits.module';
import { FilesModule } from '../files/files.module';
import { AiModule } from '../ai/ai.module';
import { LegitxScopeService } from './legitx-scope.service';
import { LegitxAssistantController } from './legitx-assistant.controller';
import { LegitxAssistantService } from './legitx-assistant.service';
import { Module } from '@nestjs/common';
import { LegitxDashboardController } from './legitx-dashboard.controller';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { LegitxComplianceController } from './legitx-compliance.controller';
import { LegitxComplianceService } from './legitx-compliance.service';
import { LegitxComplianceStatusController } from './legitx-compliance-status.controller';
import { LegitxComplianceStatusService } from './legitx-compliance-status.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    AccessModule,
    AiModule,
    ComplianceDocumentsModule,
    PayrollModule,
    AuditLogsModule,
    ServiceEntitlementsModule,
    AuditsModule,
    FilesModule,
  ],
  controllers: [
    LegitxAssistantController,
    LegitxDashboardController,
    LegitxComplianceController,
    LegitxComplianceStatusController,
  ],
  providers: [
    AssistRecallGuard,
    LegitxAssistantDocumentsService,
    LegitxAssistantService,
    LegitxScopeService,
    LegitxDashboardService,
    LegitxComplianceService,
    LegitxComplianceStatusService,
  ],
  exports: [
    LegitxDashboardService,
    LegitxComplianceService,
    LegitxComplianceStatusService,
  ],
})
export class LegitxModule {}
