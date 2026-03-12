import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { EmployeeSequenceEntity } from './entities/employee-sequence.entity';
import { EmployeeNominationEntity } from './entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from './entities/employee-nomination-member.entity';
import { EmployeeGeneratedFormEntity } from './entities/employee-generated-form.entity';
import { DepartmentEntity } from './entities/department.entity';
import { GradeEntity } from './entities/grade.entity';
import { DesignationEntity } from './entities/designation.entity';
import { SalaryRevisionEntity } from './entities/salary-revision.entity';
import { EmployeeDocumentEntity } from './entities/employee-document.entity';
import { EmployeesService } from './employees.service';
import { EmployeeBulkImportService } from './employee-bulk-import.service';
import { ClientEmployeesController } from './employees.controller';
import { EmployeeBulkImportController } from './employee-bulk-import.controller';
import { SalaryRevisionService } from './salary-revision.service';
import { SalaryRevisionController } from './salary-revision.controller';
import { EmployeeDocumentService } from './employee-document.service';
import { EmployeeDocumentController } from './employee-document.controller';
import { MasterDataController } from './master-data.controller';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeEntity,
      EmployeeSequenceEntity,
      EmployeeNominationEntity,
      EmployeeNominationMemberEntity,
      EmployeeGeneratedFormEntity,
      DepartmentEntity,
      GradeEntity,
      DesignationEntity,
      SalaryRevisionEntity,
      EmployeeDocumentEntity,
    ]),
    AiModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [
    ClientEmployeesController,
    MasterDataController,
    EmployeeBulkImportController,
    SalaryRevisionController,
    EmployeeDocumentController,
  ],
  providers: [
    EmployeesService,
    EmployeeBulkImportService,
    SalaryRevisionService,
    EmployeeDocumentService,
  ],
  exports: [
    EmployeesService,
    EmployeeBulkImportService,
    SalaryRevisionService,
    EmployeeDocumentService,
  ],
})
export class EmployeesModule {}
