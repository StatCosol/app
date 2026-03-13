import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmUnitDocumentEntity } from './entities/crm-unit-document.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { CrmDocumentsService } from './crm-documents.service';
import { CrmUnitDocumentsController } from './controllers/crm-unit-documents.controller';
import { ClientUnitDocumentsController } from './controllers/client-unit-documents.controller';
import { BranchUnitDocumentsController } from './controllers/branch-unit-documents.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      CrmUnitDocumentEntity,
      ClientAssignmentCurrentEntity,
    ]),
  ],
  controllers: [
    CrmUnitDocumentsController,
    ClientUnitDocumentsController,
    BranchUnitDocumentsController,
  ],
  providers: [CrmDocumentsService],
  exports: [CrmDocumentsService],
})
export class CrmDocumentsModule {}
