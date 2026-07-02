import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { AttendanceMismatchEntity } from './entities/attendance-mismatch.entity';
import { AttendanceAuditLogEntity } from './entities/attendance-audit-log.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricPunchEntity } from '../biometric/entities/biometric-punch.entity';
import { BiometricModule } from '../biometric/biometric.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceEntity,
      AttendanceMismatchEntity,
      AttendanceAuditLogEntity,
      EmployeeEntity,
      BiometricPunchEntity,
    ]),
    BiometricModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
