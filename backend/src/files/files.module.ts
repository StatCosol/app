import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PayrollInputFileEntity } from '../payroll/entities/payroll-input-file.entity';
import { RegistersRecordEntity } from '../payroll/entities/registers-record.entity';
import { HelpdeskMessageFileEntity } from '../helpdesk/entities/helpdesk-message-file.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([
      PayrollInputFileEntity,
      RegistersRecordEntity,
      HelpdeskMessageFileEntity,
      PayrollClientAssignmentEntity,
      ContractorDocumentEntity,
    ]),
  ],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
