import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricModule } from '../biometric/biometric.module';
import { ContractorEmployeeEntity } from '../contractor/contractor-employees/entities/contractor-employee.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceShiftEntity } from './entities/attendance-shift.entity';
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
import { PAD_PROVIDER, createPadProvider } from './pad/pad-provider';
import { MASK_DETECTOR, createMaskDetector } from './mask/mask-detector';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FaceEnrollmentEntity,
      ContractorFaceEnrollmentEntity,
      ContractorBiometricPunchEntity,
      MobileAttendanceDeviceEntity,
      FaceLivenessNonceEntity,
      AttendanceShiftEntity,
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
    { provide: PAD_PROVIDER, useFactory: createPadProvider },
    { provide: MASK_DETECTOR, useFactory: createMaskDetector },
  ],
  exports: [MobileAttendanceService],
})
export class MobileAttendanceModule {}
