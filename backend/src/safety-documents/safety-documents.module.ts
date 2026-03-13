import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafetyDocumentEntity } from './entities/safety-document.entity';
import { BranchSafetyUploadEntity } from './entities/branch-safety-upload.entity';
import { SafetyDocumentsService } from './safety-documents.service';
import { SafetyRequirementService } from './services/safety-requirement.service';
import { BranchSafetyDocumentsController } from './controllers/branch-safety-documents.controller';
import { ClientSafetyDocumentsController } from './controllers/client-safety-documents.controller';
import { CrmSafetyDocumentsController } from './controllers/crm-safety-documents.controller';
import { SafetyV2Controller } from './safety-v2.controller';
import { AuthModule } from '../auth/auth.module';
import { UnitFactsEntity } from '../units/entities/unit-facts.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyDocumentEntity,
      BranchSafetyUploadEntity,
      UnitFactsEntity,
    ]),
    AuthModule,
  ],
  controllers: [
    BranchSafetyDocumentsController,
    ClientSafetyDocumentsController,
    CrmSafetyDocumentsController,
    SafetyV2Controller,
  ],
  providers: [SafetyDocumentsService, SafetyRequirementService],
  exports: [SafetyDocumentsService, SafetyRequirementService],
})
export class SafetyDocumentsModule {}
