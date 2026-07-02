import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientStatsDashboardController } from './client-dashboard.controller';
import { ClientDashboardService } from './client-dashboard.service';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { ContractorRequiredDocumentEntity } from '../contractor/entities/contractor-required-document.entity';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { UsersModule } from '../users/users.module';
import { UserEntity } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeEntity,
      ContractorDocumentEntity,
      ContractorRequiredDocumentEntity,
      BranchContractorEntity,
      UserEntity,
    ]),
    UsersModule,
  ],
  controllers: [ClientStatsDashboardController],
  providers: [ClientDashboardService],
})
export class ClientDashboardModule {}
