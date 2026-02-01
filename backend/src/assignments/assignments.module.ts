import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientAssignmentCurrentEntity } from './entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from './entities/client-assignment-history.entity';
import { ClientAssignment } from './entities/client-assignment.entity';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientAssignmentCurrentEntity,
      ClientAssignmentHistoryEntity,
      ClientAssignment,
    ]),
    UsersModule,
    ClientsModule,
    AuditLogsModule,
  ],
  controllers: [
    AssignmentsController,
    CrmClientsController,
    AuditorClientsController,
    AssignmentRotationController,
  ],
  providers: [AssignmentsService, AssignmentRotationService],
  exports: [AssignmentsService, AssignmentRotationService, TypeOrmModule],
})
export class AssignmentsModule {}
