import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricPunchEntity } from '../biometric/entities/biometric-punch.entity';
import { BiometricModule } from '../biometric/biometric.module';
import { FacePhotoStorage } from '../mobile-attendance/face-photo-storage.service';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceEntity,
      EmployeeEntity,
      BiometricPunchEntity,
    ]),
    BiometricModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, FacePhotoStorage],
  exports: [AttendanceService, FacePhotoStorage],
})
export class AttendanceModule {}
