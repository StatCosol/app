import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceDocumentEntity } from './entities/compliance-document.entity';
import { ComplianceReturnMasterEntity } from './entities/compliance-return-master.entity';
import { BranchComplianceService } from './branch-compliance.service';
import { BranchComplianceCronService } from './branch-compliance-cron.service';
import { ComplianceMailService } from './compliance-mail.service';
import { BranchComplianceDocsController } from './controllers/branch-compliance-docs.controller';
import { CrmComplianceDocsController } from './controllers/crm-compliance-docs.controller';
import { ClientComplianceDocsController } from './controllers/client-compliance-docs.controller';
import { AuditorComplianceDocsController } from './controllers/auditor-compliance-docs.controller';
import { AdminComplianceDocsController } from './controllers/admin-compliance-docs.controller';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceDocumentEntity,
      ComplianceReturnMasterEntity,
    ]),
    AuthModule,
    EmailModule,
    AuditLogsModule,
  ],
  controllers: [
    BranchComplianceDocsController,
    CrmComplianceDocsController,
    ClientComplianceDocsController,
    AuditorComplianceDocsController,
    AdminComplianceDocsController,
  ],
  providers: [
    BranchComplianceService,
    BranchComplianceCronService,
    ComplianceMailService,
  ],
  exports: [BranchComplianceService],
})
export class BranchComplianceModule {}
