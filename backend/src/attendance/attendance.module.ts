import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricModule } from '../biometric/biometric.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceEntity, EmployeeEntity]),
    BiometricModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
