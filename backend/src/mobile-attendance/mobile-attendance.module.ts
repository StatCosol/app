import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { MobileAttendanceDeviceEntity } from './devices/device.entity';
import { FaceEnrollmentEntity } from './enrollment/face-enrollment.entity';
import { ContractorFaceEnrollmentEntity } from './enrollment/contractor-face-enrollment.entity';
import { KioskEnrollTicketEntity } from './enrollment/kiosk-enroll-ticket.entity';
import { FaceEnrollmentHistoryEntity } from './enrollment/enrollment-history.entity';
import { MobileAttendancePunchEntity } from './punch/punch.entity';
import { ContractorBiometricPunchEntity } from './punch/contractor-punch.entity';
import { FaceLivenessNonceEntity } from './liveness/liveness-nonce.entity';

// Services
import { DeviceService } from './devices/device.service';
import { EnrollmentService } from './enrollment/enrollment.service';
import { PunchService } from './punch/punch.service';
import { LivenessService } from './liveness/liveness.service';
import { FaceEmbeddingClient } from './face/face-embedding.client';
import { FacePhotoStorageService } from './face/face-photo-storage.service';

// Controllers
import {
  MobileAttendanceDevicesController,
  MobileAttendanceEnrollmentController,
  MobileAttendanceLivenessController,
  MobileAttendancePunchesController,
} from './mobile-attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MobileAttendanceDeviceEntity,
      FaceEnrollmentEntity,
      ContractorFaceEnrollmentEntity,
      KioskEnrollTicketEntity,
      FaceEnrollmentHistoryEntity,
      MobileAttendancePunchEntity,
      ContractorBiometricPunchEntity,
      FaceLivenessNonceEntity,
    ]),
  ],
  controllers: [
    MobileAttendanceDevicesController,
    MobileAttendanceEnrollmentController,
    MobileAttendanceLivenessController,
    MobileAttendancePunchesController,
  ],
  providers: [
    DeviceService,
    EnrollmentService,
    PunchService,
    LivenessService,
    FaceEmbeddingClient,
    FacePhotoStorageService,
  ],
  exports: [DeviceService, EnrollmentService, PunchService, LivenessService],
})
export class MobileAttendanceModule {}
