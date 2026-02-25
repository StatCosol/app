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

import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditsModule } from '../audits/audits.module';

import { PayrollService } from './payroll.service';
import { PayrollSetupService } from './payroll-setup.service';
import { PayrollProcessingService } from './payroll-processing.service';
import { StatutoryCalculatorService } from './services/statutory-calculator.service';
import { StateSlabService } from './services/state-slab.service';
import { StateStatutoryService } from './services/state-statutory.service';
import { PfEcrGenerator } from './generators/pf-ecr.generator';
import { EsiGenerator } from './generators/esi.generator';
import { RegisterGenerator } from './generators/register.generator';

import {
  ClientPayrollInputsController,
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
      EmployeeEntity,
    ]),
    NotificationsModule,
    AuditsModule,
  ],
  controllers: [
    PayrollAssignmentsAdminController,
    ClientPayrollInputsController,
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
  ],
  providers: [
    PayrollService,
    PayrollSetupService,
    PayrollProcessingService,
    StatutoryCalculatorService,
    StateSlabService,
    StateStatutoryService,
    PfEcrGenerator,
    EsiGenerator,
    RegisterGenerator,
  ],
  exports: [PayrollService, PayrollSetupService, PayrollProcessingService],
})
export class PayrollModule {}
