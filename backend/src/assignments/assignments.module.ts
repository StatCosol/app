import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientAssignmentCurrentEntity } from './entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from './entities/client-assignment-history.entity';
import { ClientAssignment } from './entities/client-assignment.entity';
import { BranchAuditorAssignmentEntity } from './entities/branch-auditor-assignment.entity';
import { AssignmentsService } from './assignments.service';
import {
  AssignmentsController,
  CrmClientsController,
  AuditorClientsController,
} from './assignments.controller';
import { UsersModule } from '../users/users.module';
import { ClientsModule } from '../clients/clients.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AssignmentRotationService } from './assignment-rotation.service';
import { AssignmentRotationController } from './assignment-rotation.controller';
import { CrmAssignmentGuard } from './crm-assignment.guard';
import { AuditorAssignmentGuard } from './auditor-assignment.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientAssignmentCurrentEntity,
      ClientAssignmentHistoryEntity,
      ClientAssignment,
      BranchAuditorAssignmentEntity,
    ]),
    UsersModule,
    ClientsModule,
    AuditLogsModule,
    forwardRef(() => NotificationsModule),
    EmailModule,
  ],
  controllers: [
    AssignmentsController,
    CrmClientsController,
    AuditorClientsController,
    AssignmentRotationController,
  ],
  providers: [
    AssignmentsService,
    AssignmentRotationService,
    CrmAssignmentGuard,
    AuditorAssignmentGuard,
  ],
  exports: [
    AssignmentsService,
    AssignmentRotationService,
    TypeOrmModule,
    CrmAssignmentGuard,
    AuditorAssignmentGuard,
  ],
})
export class AssignmentsModule {}
