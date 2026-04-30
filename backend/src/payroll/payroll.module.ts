import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollInputEntity } from './entities/payroll-input.entity';
import { PayrollInputFileEntity } from './entities/payroll-input-file.entity';
import { RegistersRecordEntity } from './entities/registers-record.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunItemEntity } from './entities/payroll-run-item.entity';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollComponentMasterEntity } from './entities/payroll-component-master.entity';
import { PayrollClientComponentOverrideEntity } from './entities/payroll-client-component-override.entity';
import { PayrollClientPayslipLayoutEntity } from './entities/payroll-client-payslip-layout.entity';
import { PayrollInputStatusHistoryEntity } from './entities/payroll-input-status-history.entity';
import { PayrollTemplate } from './entities/payroll-template.entity';
import { PayrollTemplateComponent } from './entities/payroll-template-component.entity';
import { PayrollClientTemplate } from './entities/payroll-client-template.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
// New entities
import { PayrollClientSetupEntity } from './entities/payroll-client-setup.entity';
import { PayrollComponentEntity } from './entities/payroll-component.entity';
import { PayrollComponentRuleEntity } from './entities/payroll-component-rule.entity';
import { PayrollComponentSlabEntity } from './entities/payroll-component-slab.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { RegisterTemplateEntity } from './entities/register-template.entity';
import { PayrollStatutorySlabEntity } from './entities/payroll-statutory-slab.entity';
import { PayrollQueryEntity } from './entities/payroll-query.entity';
import { PayrollQueryMessageEntity } from './entities/payroll-query-message.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { PayrollFnfEventEntity } from './entities/payroll-fnf-event.entity';
import { PayrollFnfDocumentEntity } from './entities/payroll-fnf-document.entity';
// Engine entities
import { PayRuleSetEntity } from './entities/pay-rule-set.entity';
import { PayRuleParameterEntity } from './entities/pay-rule-parameter.entity';
import { PaySalaryStructureEntity } from './entities/pay-salary-structure.entity';
import { PaySalaryStructureItemEntity } from './entities/pay-salary-structure-item.entity';
import { PayCalcTraceEntity } from './entities/pay-calc-trace.entity';

import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditsModule } from '../audits/audits.module';
import { AttendanceModule } from '../attendance/attendance.module';

import { PayrollService } from './payroll.service';
import { PayrollSetupService } from './payroll-setup.service';
import { PayrollProcessingService } from './payroll-processing.service';
import { StatutoryCalculatorService } from './services/statutory-calculator.service';
import { StateSlabService } from './services/state-slab.service';
import { StateStatutoryService } from './services/state-statutory.service';
import { PfEcrGenerator } from './generators/pf-ecr.generator';
import { EsiGenerator } from './generators/esi.generator';
import { RegisterGenerator } from './generators/register.generator';
// Engine services
import { RoundingService } from './engine/rounding.service';
import { StructureResolverService } from './engine/structure-resolver.service';
import { RulesetResolverService } from './engine/ruleset-resolver.service';
import { WageBaseService } from './engine/wage-base.service';
import { PayrollEngineService } from './engine/payroll-engine.service';

import {
  ClientPayrollInputsController,
  ClientPayrollMonitoringController,
  PayrollController,
  ClientRegistersRecordsController,
  ClientPayrollSettingsController,
  ClientComponentsEffectiveController,
  ClientPayslipLayoutController,
  ClientPayrollTemplateController,
  AuditorRegistersController,
} from './payroll.controller';
import { PayrollConfigController } from './payroll.config.controller';
import { PayrollAssignmentsAdminController } from './payroll-assignments.admin.controller';
import {
  PayrollSetupController,
  ClientPayrollSetupController,
} from './payroll-setup.controller';
import { PayrollProcessingController } from './payroll-processing.controller';
import { PaydekListController } from './paydek-list.controller';
import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollReportsService } from './payroll-reports.service';
import { ListQueriesModule } from '../list-queries/list-queries.module';
// Engine controller
import { PayrollEngineController } from './engine/payroll-engine.controller';
// TDS
import { TdsCalculatorService } from './services/tds-calculator.service';
import { TdsController } from './tds.controller';
// Payslip generation
import { PayslipGeneratorService } from './services/payslip-generator.service';
import { PayslipController } from './payslip.controller';
// Approval workflow
import { PayrollApprovalService } from './payroll-approval.service';
import { PayrollApprovalController } from './payroll-approval.controller';
// Config audit trail
import { PayrollConfigAuditEntity } from './entities/payroll-config-audit.entity';
import { PayrollConfigAuditService } from './payroll-config-audit.service';
// Gratuity
import { GratuityCalculatorService } from './services/gratuity-calculator.service';
import { GratuityController } from './gratuity.controller';
import { ClientPayrollToggleGuard } from '../auth/policies/client-payroll-toggle.guard';
// Client-structures engine
import { PayrollClientStructureEntity } from './entities/payroll-client-structure.entity';
import { PayrollStructureComponentEntity } from './entities/payroll-structure-component.entity';
import { PayrollComponentConditionEntity } from './entities/payroll-component-condition.entity';
import { PayrollStatutoryConfigEntity } from './entities/payroll-statutory-config.entity';
import { LeaveLedgerEntity } from '../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { ClientStructuresService } from './client-structures.service';
import { ClientPayrollCalculationService } from './client-payroll-calculation.service';
import { ClientStructuresController } from './client-structures.controller';
import { CtcSummaryService } from './ctc-summary.service';
import {
  ClientCtcSummaryController,
  BranchCtcController,
} from './ctc-summary.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollClientAssignmentEntity,
      PayrollInputEntity,
      PayrollInputFileEntity,
      RegistersRecordEntity,
      PayrollRunEntity,
      PayrollRunEmployeeEntity,
      PayrollRunItemEntity,
      PayrollPayslipArchiveEntity,
      PayrollComponentMasterEntity,
      PayrollClientComponentOverrideEntity,
      PayrollClientPayslipLayoutEntity,
      ClientEntity,
      PayrollInputStatusHistoryEntity,
      PayrollTemplate,
      PayrollTemplateComponent,
      PayrollClientTemplate,
      PayrollClientSettings,
      // New entities
      PayrollClientSetupEntity,
      PayrollComponentEntity,
      PayrollComponentRuleEntity,
      PayrollComponentSlabEntity,
      PayrollRunComponentValueEntity,
      RegisterTemplateEntity,
      PayrollStatutorySlabEntity,
      PayrollQueryEntity,
      PayrollQueryMessageEntity,
      PayrollFnfEntity,
      PayrollFnfEventEntity,
      PayrollFnfDocumentEntity,
      EmployeeEntity,
      // Engine entities
      PayRuleSetEntity,
      PayRuleParameterEntity,
      PaySalaryStructureEntity,
      PaySalaryStructureItemEntity,
      PayCalcTraceEntity,
      PayrollConfigAuditEntity,
      // Client-structures engine entities
      PayrollClientStructureEntity,
      PayrollStructureComponentEntity,
      PayrollComponentConditionEntity,
      PayrollStatutoryConfigEntity,
      LeaveLedgerEntity,
      LeaveBalanceEntity,
    ]),
    NotificationsModule,
    AuditsModule,
    ListQueriesModule,
    AttendanceModule,
  ],
  controllers: [
    PayrollAssignmentsAdminController,
    ClientPayrollInputsController,
    ClientPayrollMonitoringController,
    PayrollController,
    ClientRegistersRecordsController,
    ClientPayrollSettingsController,
    ClientComponentsEffectiveController,
    ClientPayslipLayoutController,
    ClientPayrollTemplateController,
    PayrollConfigController,
    // New controllers
    PayrollSetupController,
    ClientPayrollSetupController,
    PayrollProcessingController,
    AuditorRegistersController,
    PaydekListController,
    PayrollReportsController,
    // Engine controller
    PayrollEngineController,
    // TDS
    TdsController,
    // Payslip
    PayslipController,
    // Approval
    PayrollApprovalController,
    // Gratuity
    GratuityController,
    // Client-structures engine
    ClientStructuresController,
    // CTC Summary
    ClientCtcSummaryController,
    BranchCtcController,
  ],
  providers: [
    PayrollService,
    ClientPayrollToggleGuard,
    PayrollSetupService,
    PayrollProcessingService,
    StatutoryCalculatorService,
    StateSlabService,
    StateStatutoryService,
    PfEcrGenerator,
    EsiGenerator,
    RegisterGenerator,
    PayrollReportsService,
    // Engine services
    RoundingService,
    StructureResolverService,
    RulesetResolverService,
    WageBaseService,
    PayrollEngineService,
    TdsCalculatorService,
    PayslipGeneratorService,
    PayrollApprovalService,
    PayrollConfigAuditService,
    GratuityCalculatorService,
    // Client-structures engine
    ClientStructuresService,
    ClientPayrollCalculationService,
    CtcSummaryService,
  ],
  exports: [
    PayrollService,
    PayrollSetupService,
    PayrollProcessingService,
    PayrollEngineService,
    TdsCalculatorService,
  ],
})
export class PayrollModule {}
