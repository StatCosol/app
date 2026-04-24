import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ContractorController,
  AdminContractorsController,
  CrmContractorsController,
} from './contractor.controller';
import { ClientContractorsController } from './client-contractors.controller';
import { CrmContractorRegistrationController } from './crm-contractor-registration.controller';
import { CrmContractorRegistrationService } from './crm-contractor-registration.service';
import {
  CrmContractorRequiredDocumentsController,
  ClientContractorRequiredDocumentsController,
} from './contractor-required-documents.controller';
import { ContractorRequiredDocumentsService } from './contractor-required-documents.service';
import { BranchesModule } from '../branches/branches.module';
import { ContractorService } from './contractor.service';
import { ContractorDocumentsController } from './contractor-documents.controller';
import { ContractorDocumentsService } from './contractor-documents.service';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchComplianceEntity } from '../checklists/entities/branch-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RoleEntity } from '../users/entities/role.entity';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { ContractorRequiredDocumentEntity } from './entities/contractor-required-document.entity';
import { ContractorDashboardService } from './contractor-dashboard.service';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditEntity } from '../audits/entities/audit.entity';
import { AuditsModule } from '../audits/audits.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { ContractorListController } from './contractor-list.controller';
import { ListQueriesModule } from '../list-queries/list-queries.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { ContractorEmployeeEntity } from './contractor-employees/entities/contractor-employee.entity';
import {
  ContractorEmployeesController,
  ClientContractorEmployeesController,
} from './contractor-employees/contractor-employees.controller';
import { ContractorEmployeesService } from './contractor-employees/contractor-employees.service';
import { ClraAssignmentsController } from './clra-assignments.controller';
import { ClraAssignmentsService } from './clra-assignments.service';
import { ClraPeEstablishment } from './entities/clra-pe-establishment.entity';
import { ClraContractor } from './entities/clra-contractor.entity';
import { ClraContractorAssignment } from './entities/clra-contractor-assignment.entity';
import { ClraContractorWorker } from './entities/clra-contractor-worker.entity';
import { ClraWorkerDeployment } from './entities/clra-worker-deployment.entity';
import { ClraWagePeriod } from './entities/clra-wage-period.entity';
import { ClraAttendance } from './entities/clra-attendance.entity';
import { ClraWage } from './entities/clra-wage.entity';
import { ClraRegisterRun } from './entities/clra-register-run.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchContractorEntity,
      BranchEntity,
      BranchComplianceEntity,
      ComplianceMasterEntity,
      ClientEntity,
      UserEntity,
      RoleEntity,
      ContractorDocumentEntity,
      ContractorRequiredDocumentEntity,
      ContractorEmployeeEntity,
      AuditEntity,
      ClraPeEstablishment,
      ClraContractor,
      ClraContractorAssignment,
      ClraContractorWorker,
      ClraWorkerDeployment,
      ClraWagePeriod,
      ClraAttendance,
      ClraWage,
      ClraRegisterRun,
    ]),
    AuthModule, // ✅ required (ClientContractorsController uses BranchAccessService)
    UsersModule,
    AssignmentsModule,
    AuditsModule,
    BranchesModule, // ✅ required (ClientContractorsController uses BranchesService)
    AiModule,
    ListQueriesModule,
    ComplianceModule,
  ],
  controllers: [
    ContractorController,
    AdminContractorsController,
    CrmContractorsController,
    CrmContractorRegistrationController,
    ClientContractorsController,
    ContractorDocumentsController,
    CrmContractorRequiredDocumentsController,
    ClientContractorRequiredDocumentsController,
    ContractorListController,
    ContractorEmployeesController,
    ClientContractorEmployeesController,
    ClraAssignmentsController,
  ],
  providers: [
    ContractorService,
    ContractorDocumentsService,
    CrmContractorRegistrationService,
    ContractorDashboardService,
    ContractorRequiredDocumentsService,
    ContractorEmployeesService,
    ClraAssignmentsService,
  ],
})
export class ContractorModule {}
