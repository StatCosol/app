import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceReturnEntity } from './entities/compliance-return.entity';
import { ComplianceReturnMasterEntity } from '../branch-compliance/entities/compliance-return-master.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceNotificationCenterEntity } from './entities/compliance-notification-center.entity';
import { ReturnsService } from './returns.service';
import { ClientReturnsController } from './client-returns.controller';
import { CrmReturnsController } from './crm-returns.controller';
import { AdminReturnsController } from './admin-returns.controller';
import { ClientReturnsVisibilityController } from './controllers/client-returns-visibility.controller';
import { ClientReturnsVisibilityService } from './services/client-returns-visibility.service';
import { ComplianceNotificationCenterService } from './services/compliance-notification-center.service';
import { ReturnsUploadController } from './controllers/common/returns-upload.controller';
import { ComplianceNotificationCenterController } from './controllers/common/compliance-notification-center.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    TypeOrmModule.forFeature([
      ComplianceReturnEntity,
      ComplianceReturnMasterEntity,
      ClientAssignmentCurrentEntity,
      BranchEntity,
      ComplianceNotificationCenterEntity,
    ]),
  ],
  controllers: [
    ClientReturnsController,
    CrmReturnsController,
    AdminReturnsController,
    ClientReturnsVisibilityController,
    ReturnsUploadController,
    ComplianceNotificationCenterController,
  ],
  providers: [
    ReturnsService,
    ClientReturnsVisibilityService,
    ComplianceNotificationCenterService,
  ],
  exports: [
    ReturnsService,
    ClientReturnsVisibilityService,
    ComplianceNotificationCenterService,
  ],
})
export class ReturnsModule {}
