import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricModule } from '../biometric/biometric.module';
import { FaceEmbeddingClient } from '../mobile-attendance/face/face-embedding.client';
import { FacePhotoStorageService } from '../mobile-attendance/face/face-photo-storage.service';
import {
  FaceDeskAttendanceEntity,
  FaceDeskAuditEntity,
  FaceDeskCorrectionEntity,
  FaceDeskDeviceEntity,
  FaceDeskDuplicateAlertEntity,
  FaceDeskFailedAttemptEntity,
  FaceDeskProfileEntity,
  FaceDeskReviewQueueEntity,
  FaceDeskSampleEntity,
  FaceDeskSettingsEntity,
  FaceDeskSyncLogEntity,
} from './entities/facedesk.entities';
import { FaceDeskController } from './facedesk.controller';
import { FaceDeskDeviceController } from './facedesk-device.controller';
import { FaceDeskDeviceService } from './facedesk-device.service';
import { FaceDeskDeviceAuthGuard } from './facedesk-device-auth.guard';
import { FaceDeskFaceService } from './facedesk-face.service';
import { FaceDeskSettingsService } from './facedesk-settings.service';
import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { FaceDeskAdminService } from './facedesk-admin.service';
import { FaceDeskDashboardService } from './facedesk-dashboard.service';
import { FaceDeskReportsService } from './facedesk-reports.service';

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
      FaceDeskSyncLogEntity,
      FaceDeskSettingsEntity,
      FaceDeskAuditEntity,
    ]),
    BiometricModule,
  ],
  controllers: [FaceDeskController, FaceDeskDeviceController],
  providers: [
    FaceDeskSettingsService,
    FaceDeskFaceService,
    FaceDeskEnrollmentService,
    FaceDeskAttendanceService,
    FaceDeskAdminService,
    FaceDeskDashboardService,
    FaceDeskReportsService,
    FaceDeskDeviceService,
    FaceDeskDeviceAuthGuard,
    FaceEmbeddingClient,
    FacePhotoStorageService,
  ],
  exports: [FaceDeskSettingsService],
})
export class FaceDeskModule {}
