import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricModule } from '../biometric/biometric.module';
import { FaceEmbeddingClient } from '../mobile-attendance/face/face-embedding.client';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import {
  FaceDeskAttendanceEntity,
  FaceDeskAuditEntity,
  FaceDeskCorrectionEntity,
  FaceDeskDayReviewEntity,
  FaceDeskDeviceEntity,
  FaceDeskDuplicateAlertEntity,
  FaceDeskFailedAttemptEntity,
  FaceDeskProfileEntity,
  FaceDeskReviewQueueEntity,
  FaceDeskSampleEntity,
  FaceDeskSettingsEntity,
  FaceDeskSyncLogEntity,
  FaceDeskEnrollTicketEntity,
} from './entities/facedesk.entities';
import { FaceDeskEnrollmentController } from './facedesk-enrollment.controller';
import { FaceDeskAttendancePortalController } from './facedesk-attendance-portal.controller';
import { FaceDeskAdminController } from './facedesk-admin.controller';
import { FaceDeskDevicesAdminController } from './facedesk-devices-admin.controller';
import { FaceDeskReportsController } from './facedesk-reports.controller';
import { FaceDeskDeviceController } from './facedesk-device.controller';
import { FaceDeskDeviceService } from './facedesk-device.service';
import { FaceDeskDeviceAuthGuard } from './facedesk-device-auth.guard';
import { FaceDeskFaceService } from './facedesk-face.service';
import {
  DeviceLivenessProvider,
  FACEDESK_LIVENESS_PROVIDER,
} from './facedesk-liveness.provider';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { FaceDeskOfflineSyncService } from './facedesk-offline-sync.service';
import { FaceDeskFailedAttemptService } from './facedesk-failed-attempt.service';
import { FaceDeskPinAttendanceService } from './facedesk-pin-attendance.service';
import { FaceDeskPunchAcceptService } from './facedesk-punch-accept.service';
import { FaceDeskPunchDirectionService } from './facedesk-punch-direction.service';
import { FaceDeskAdminService } from './facedesk-admin.service';
import { FaceDeskDashboardService } from './facedesk-dashboard.service';
import { FaceDeskReportsService } from './facedesk-reports.service';
import { FaceDeskTicketService } from './facedesk-ticket.service';
import { AzureFaceClient } from './azure-face.client';
import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';

/**
 * FaceDesk V2 — StatCo Smart Attendance Kiosk. Net-new module, separate from
 * V1 mobile-attendance. Reuses the shared face-svc client, face-math and the
 * scoped photo storage. Not for deploy until the module is feature-complete
 * and validated (V1 stays live meanwhile).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FaceDeskDeviceEntity,
      FaceDeskProfileEntity,
      FaceDeskSampleEntity,
      FaceDeskAttendanceEntity,
      FaceDeskFailedAttemptEntity,
      FaceDeskDuplicateAlertEntity,
      FaceDeskReviewQueueEntity,
      FaceDeskCorrectionEntity,
      FaceDeskDayReviewEntity,
      FaceDeskSyncLogEntity,
      FaceDeskSettingsEntity,
      FaceDeskAuditEntity,
      FaceDeskEnrollTicketEntity,
      ContractorBiometricPunchEntity,
    ]),
    BiometricModule,
  ],
  controllers: [
    FaceDeskEnrollmentController,
    FaceDeskAttendancePortalController,
    FaceDeskAdminController,
    FaceDeskDevicesAdminController,
    FaceDeskReportsController,
    FaceDeskDeviceController,
  ],
  providers: [
    FaceDeskSettingsService,
    FaceDeskFaceService,
    FaceDeskEnrollmentService,
    FaceDeskAttendanceService,
    FaceDeskOfflineSyncService,
    FaceDeskPunchDirectionService,
    FaceDeskFailedAttemptService,
    FaceDeskPunchAcceptService,
    FaceDeskPinAttendanceService,
    FaceDeskAdminService,
    FaceDeskDashboardService,
    FaceDeskReportsService,
    FaceDeskDeviceService,
    FaceDeskTicketService,
    FaceDeskDeviceAuthGuard,
    FaceEmbeddingClient,
    FacePhotoStorageService,
    AzureFaceClient,
    FaceDeskAzureFaceService,
    // Liveness-provider seam: device blink today; swap the binding (e.g. to an
    // Azure Face Liveness provider) without touching the attendance service.
    { provide: FACEDESK_LIVENESS_PROVIDER, useClass: DeviceLivenessProvider },
  ],
  exports: [FaceDeskSettingsService, FaceDeskAdminService],
})
export class FaceDeskModule {}
