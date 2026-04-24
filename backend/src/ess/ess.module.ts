import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { EmployeeStatutoryEntity } from '../employees/entities/employee-statutory.entity';
import { EmployeeNominationEntity } from '../employees/entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from '../employees/entities/employee-nomination-member.entity';
import { LeaveApplicationEntity } from './entities/leave-application.entity';
import { LeaveBalanceEntity } from './entities/leave-balance.entity';
import { LeaveLedgerEntity } from './entities/leave-ledger.entity';
import { LeavePolicyEntity } from './entities/leave-policy.entity';
import { PayrollPayslipArchiveEntity } from '../payroll/entities/payroll-payslip-archive.entity';
import { PayrollRunEntity } from '../payroll/entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../payroll/entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../payroll/entities/payroll-run-component-value.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { EssService } from './ess.service';
import {
  EssController,
  BranchApprovalsController,
  ClientApprovalsController,
  LeaveManagementController,
} from './ess.controller';
import { AuthModule } from '../auth/auth.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { PerformanceAppraisalModule } from '../performance-appraisal/performance-appraisal.module';

@Module({
  imports: [
    AuthModule,
    AttendanceModule,
    PerformanceAppraisalModule,
    TypeOrmModule.forFeature([
      EmployeeEntity,
      EmployeeStatutoryEntity,
      EmployeeNominationEntity,
      EmployeeNominationMemberEntity,
      LeaveApplicationEntity,
      LeaveBalanceEntity,
      LeaveLedgerEntity,
      LeavePolicyEntity,
      PayrollPayslipArchiveEntity,
      PayrollRunEntity,
      PayrollRunEmployeeEntity,
      PayrollRunComponentValueEntity,
      ClientEntity,
    ]),
  ],
  controllers: [
    EssController,
    BranchApprovalsController,
    ClientApprovalsController,
    LeaveManagementController,
  ],
  providers: [EssService],
  exports: [EssService],
})
export class EssModule {}
