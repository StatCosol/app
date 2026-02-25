import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceDocumentEntity } from './entities/compliance-document.entity';
import { ComplianceDocumentVisibilityEntity } from './entities/compliance-document-visibility.entity';
import { CompanySettingsEntity } from './entities/company-settings.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { ComplianceDocumentsService } from './compliance-documents.service';
import { ClientComplianceDocsController } from './client-compliance-docs.controller';
import { CrmComplianceDocsController } from './crm-compliance-docs.controller';
import { AdminComplianceDocsController } from './admin-compliance-docs.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      ComplianceDocumentEntity,
      ComplianceDocumentVisibilityEntity,
      CompanySettingsEntity,
      ClientAssignmentCurrentEntity,
    ]),
  ],
  controllers: [
    ClientComplianceDocsController,
    CrmComplianceDocsController,
    AdminComplianceDocsController,
  ],
  providers: [ComplianceDocumentsService],
  exports: [ComplianceDocumentsService],
})
export class ComplianceDocumentsModule {}
