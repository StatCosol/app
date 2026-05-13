import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricModule } from '../biometric/biometric.module';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { FaceEnrollmentEntity } from './entities/face-enrollment.entity';
import { MobileAttendanceDeviceEntity } from './entities/mobile-attendance-device.entity';
import {
  MobileAttendanceAdminController,
  MobileAttendanceDeviceController,
} from './mobile-attendance.controller';
import { MobileAttendanceService } from './mobile-attendance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FaceEnrollmentEntity,
      MobileAttendanceDeviceEntity,
      EmployeeEntity,
    ]),
    BiometricModule,
  ],
  controllers: [MobileAttendanceAdminController, MobileAttendanceDeviceController],
  providers: [MobileAttendanceService],
  exports: [MobileAttendanceService],
})
export class MobileAttendanceModule {}
