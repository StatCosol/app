import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationCategoryEntity } from './entities/audit-observation-category.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditsService } from './audits.service';
import {
  AuditorAuditsController,
  AuditorAuditsLegacyController,
  CrmAuditsController,
  ClientAuditsController,
  AuditKpiController,
} from './audits.controller';
import { AuditorObservationsController } from './auditor-observations.controller';
import { AuditorObservationsService } from './auditor-observations.service';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditEntity,
      AuditObservationCategoryEntity,
      AuditObservationEntity,
    ]),
    ClientsModule,
    UsersModule,
    AssignmentsModule,
    AuthModule,
    AiModule,
  ],
  controllers: [
    // Register the static KPI routes before the legacy /audits/:id alias.
    AuditKpiController,
    CrmAuditsController,
    AuditorAuditsController,
    AuditorAuditsLegacyController,
    ClientAuditsController,
    AuditorObservationsController,
  ],
  providers: [AuditsService, AuditorObservationsService],
  exports: [TypeOrmModule, AuditsService],
})
export class AuditsModule {}
