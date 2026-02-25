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
import {
  ContractorDocumentsController,
} from './contractor-documents.controller';
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
      AuditEntity,
    ]),
    AuthModule, // ✅ required (ClientContractorsController uses BranchAccessService)
    UsersModule,
    AssignmentsModule,
    AuditsModule,
    BranchesModule, // ✅ required (ClientContractorsController uses BranchesService)
    AiModule,
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
  ],
  providers: [
    ContractorService,
    ContractorDocumentsService,
    CrmContractorRegistrationService,
    ContractorDashboardService,
    ContractorRequiredDocumentsService,
  ],
})
export class ContractorModule {}
