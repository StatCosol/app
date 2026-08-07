import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { AttendanceMismatchEntity } from './entities/attendance-mismatch.entity';
import { AttendanceAuditLogEntity } from './entities/attendance-audit-log.entity';
import { HolidayCalendarEntity } from './entities/holiday-calendar.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricPunchEntity } from '../biometric/entities/biometric-punch.entity';
import { BiometricModule } from '../biometric/biometric.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { HolidayCalendarService } from './holiday-calendar.service';
import { HolidayCalendarController } from './holiday-calendar.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceEntity,
      AttendanceMismatchEntity,
      AttendanceAuditLogEntity,
      HolidayCalendarEntity,
      EmployeeEntity,
      BiometricPunchEntity,
    ]),
    BiometricModule,
  ],
  controllers: [AttendanceController, HolidayCalendarController],
  providers: [AttendanceService, HolidayCalendarService],
  exports: [AttendanceService, HolidayCalendarService],
})
export class AttendanceModule {}
