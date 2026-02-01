import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEntity } from './entities/audit.entity';
import { AuditsService } from './audits.service';
import {
  AuditorAuditsController,
  CrmAuditsController,
} from './audits.controller';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditEntity]),
    ClientsModule,
    UsersModule,
    AssignmentsModule,
  ],
  controllers: [CrmAuditsController, AuditorAuditsController],
  providers: [AuditsService],
})
export class AuditsModule {}
