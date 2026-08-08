import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceEntitlementsModule } from '../service-entitlements/service-entitlements.module';
import { BiometricModule } from '../biometric/biometric.module';

// Entities
import { MobileAttendanceDeviceEntity } from './devices/device.entity';
import { FaceEnrollmentEntity } from './enrollment/face-enrollment.entity';
import { ContractorFaceEnrollmentEntity } from './enrollment/contractor-face-enrollment.entity';
import { KioskEnrollTicketEntity } from './enrollment/kiosk-enroll-ticket.entity';
import { FaceEnrollmentHistoryEntity } from './enrollment/enrollment-history.entity';
import { FaceEnrollmentTemplateEntity } from './enrollment/face-enrollment-template.entity';
import { MobileAttendancePunchEntity } from './punch/punch.entity';
import { ContractorBiometricPunchEntity } from './punch/contractor-punch.entity';
import { FaceLivenessNonceEntity } from './liveness/liveness-nonce.entity';

// Services
import { DeviceAuthGuard } from './devices/device-auth.guard';
import { DeviceService } from './devices/device.service';
import { EnrollmentService } from './enrollment/enrollment.service';
import { PunchService } from './punch/punch.service';
import { PunchDirectionService } from './punch/punch-direction.service';
import { PunchContractorAdminService } from './punch/punch-contractor-admin.service';
import { PunchReviewService } from './punch/punch-review.service';
import { LivenessService } from './liveness/liveness.service';
import { FaceEmbeddingClient } from './face/face-embedding.client';
import { FacePhotoStorageService } from './face/face-photo-storage.service';
import { FaceTemplateService } from './face/face-template.service';
import { FaceRetentionService } from './face/face-retention.service';

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
      FaceEnrollmentTemplateEntity,
      MobileAttendancePunchEntity,
      ContractorBiometricPunchEntity,
      FaceLivenessNonceEntity,
    ]),
    ServiceEntitlementsModule,
    BiometricModule,
  ],
  controllers: [
    MobileAttendanceDevicesController,
    MobileAttendanceEnrollmentController,
    MobileAttendanceLivenessController,
    MobileAttendancePunchesController,
  ],
  providers: [
    DeviceAuthGuard,
    DeviceService,
    EnrollmentService,
    PunchDirectionService,
    PunchContractorAdminService,
    PunchReviewService,
    PunchService,
    LivenessService,
    FaceEmbeddingClient,
    FacePhotoStorageService,
    FaceTemplateService,
    FaceRetentionService,
  ],
  exports: [DeviceService, EnrollmentService, PunchService, LivenessService],
})
export class MobileAttendanceModule {}
