import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceReturnEntity } from './entities/compliance-return.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { ReturnsService } from './returns.service';
import { ClientReturnsController } from './client-returns.controller';
import { CrmReturnsController } from './crm-returns.controller';
import { AdminReturnsController } from './admin-returns.controller';
import { AuditorReturnsController } from './auditor-returns.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([ComplianceReturnEntity, ClientAssignmentCurrentEntity]),
  ],
  controllers: [ClientReturnsController, CrmReturnsController, AdminReturnsController, AuditorReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
