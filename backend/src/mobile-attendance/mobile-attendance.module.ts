import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricModule } from '../biometric/biometric.module';
import { ContractorEmployeeEntity } from '../contractor/contractor-employees/entities/contractor-employee.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractorBiometricPunchEntity } from './entities/contractor-biometric-punch.entity';
import { ContractorFaceEnrollmentEntity } from './entities/contractor-face-enrollment.entity';
import { FaceEnrollmentEntity } from './entities/face-enrollment.entity';
import { FaceLivenessNonceEntity } from './entities/face-liveness-nonce.entity';
import { MobileAttendanceDeviceEntity } from './entities/mobile-attendance-device.entity';
import {
  MobileAttendanceAdminController,
  MobileAttendanceDeviceController,
} from './mobile-attendance.controller';
import { MobileAttendanceService } from './mobile-attendance.service';
import { FaceEmbeddingClient } from './face-embedding.client';
import { FacePhotoStorage } from './face-photo-storage.service';
import { FaceFailureAlertCronService } from './face-failure-alert-cron.service';
import { FacePhotoRetentionCron } from './face-photo-retention.cron';
import { FaceAppearanceDriftCron } from './face-appearance-drift.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FaceEnrollmentEntity,
      ContractorFaceEnrollmentEntity,
      ContractorBiometricPunchEntity,
      MobileAttendanceDeviceEntity,
      FaceLivenessNonceEntity,
      EmployeeEntity,
      ContractorEmployeeEntity,
    ]),
    BiometricModule,
    NotificationsModule,
  ],
  controllers: [
    MobileAttendanceAdminController,
    MobileAttendanceDeviceController,
  ],
  providers: [
    MobileAttendanceService,
    FaceEmbeddingClient,
    FacePhotoStorage,
    FaceFailureAlertCronService,
    FacePhotoRetentionCron,
    FaceAppearanceDriftCron,
  ],
  exports: [MobileAttendanceService],
})
export class MobileAttendanceModule {}
