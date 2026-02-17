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
import { PayrollService } from './payroll.service';
import {
  ClientPayrollInputsController,
  PayrollController,
  ClientRegistersRecordsController,
  ClientComponentsEffectiveController,
  ClientPayslipLayoutController,
  ClientPayrollTemplateController,
} from './payroll.controller';
import { PayrollConfigController } from './payroll.config.controller';
import { PayrollAssignmentsAdminController } from './payroll-assignments.admin.controller';
import { PayrollTemplate } from './entities/payroll-template.entity';
import { PayrollTemplateComponent } from './entities/payroll-template-component.entity';
import { PayrollClientTemplate } from './entities/payroll-client-template.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { NotificationsModule } from '../notifications/notifications.module';

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
    ]),
    NotificationsModule,
  ],
  controllers: [
    PayrollAssignmentsAdminController,
    ClientPayrollInputsController,
    PayrollController,
    ClientRegistersRecordsController,
    ClientComponentsEffectiveController,
    ClientPayslipLayoutController,
    ClientPayrollTemplateController,
    PayrollConfigController,
  ],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
