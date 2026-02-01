import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ContractorController,
  AdminContractorsController,
  CrmContractorsController,
} from './contractor.controller';
import { ClientContractorsController } from './client-contractors.controller';
import { BranchesModule } from '../branches/branches.module';
import { ContractorService } from './contractor.service';
import {
  ContractorDocumentsController,
  CrmContractorDocumentsController,
} from './contractor-documents.controller';
import { ContractorDocumentsService } from './contractor-documents.service';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchComplianceEntity } from '../checklists/entities/branch-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditEntity } from '../audits/entities/audit.entity';
import { AuditsModule } from '../audits/audits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchContractorEntity,
      BranchEntity,
      BranchComplianceEntity,
      ComplianceMasterEntity,
      ClientEntity,
      UserEntity,
      ContractorDocumentEntity,
      AuditEntity,
    ]),
    UsersModule,
    AssignmentsModule,
    AuditsModule,
    BranchesModule, // ✅ required (ClientContractorsController uses BranchesService)
  ],
  controllers: [
    ContractorController,
    AdminContractorsController,
    CrmContractorsController,
    ClientContractorsController, // ✅ was missing
    ContractorDocumentsController,
    CrmContractorDocumentsController,
  ],
  providers: [ContractorService, ContractorDocumentsService],
})
export class ContractorModule {}
