import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { FaceDeskSettingsService } from './facedesk-settings.service';

/**
 * FaceDesk V2 — StatCo Smart Attendance Kiosk.
 * Net-new module, separate from V1 mobile-attendance. Phase 1: schema,
 * entities and calibrated settings. Enrollment/attendance/admin/report
 * controllers land in later phases.
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
  ],
  providers: [FaceDeskSettingsService],
  exports: [FaceDeskSettingsService, TypeOrmModule],
})
export class FaceDeskModule {}
