/**
 * FaceDesk V2 request DTOs.
 *
 * Frame model: the kiosk captures 10-15 frames and sends them either as
 * device-computed embeddings (works offline) or as base64 photos (server
 * embeds via face-svc). Each frame may carry the device's own quality metrics
 * and a liveness result from the on-device blink/head-turn challenge.
 */

export interface FaceFrameDto {
  /** base64 little-endian float32 embedding (device path). */
  embeddingB64?: string;
  /** base64 JPEG/PNG (server-embed path via face-svc). */
  photoB64?: string;
  embeddingModel?: string;
  /** device-computed quality 0..1 (face score / sharpness proxy). */
  qualityScore?: number;
  /** device liveness probability 0..1 for this frame, if any. */
  livenessScore?: number;
  sampleType?: 'FRONT' | 'LEFT' | 'RIGHT' | 'EXPRESSION' | 'LIVENESS';
}

export class SaveEnrollmentDto {
  employeeId: string;
  frames: FaceFrameDto[];
  /** primary photo to persist (scoped storage), optional. */
  photoB64?: string;
  /** on-device blink/head-turn challenge passed. */
  livenessPassed?: boolean;
  consentGiven?: boolean;
}

export class ValidateQualityDto {
  frames: FaceFrameDto[];
}

export class CheckDuplicateDto {
  employeeId: string;
  frames: FaceFrameDto[];
}

export class MarkAttendanceDto {
  frames: FaceFrameDto[];
  photoB64?: string;
  livenessPassed?: boolean;
  /** client-generated id for offline dedupe; unique per (client, ref). */
  offlineRef?: string;
  /** ISO time of capture (offline punches carry their original time). */
  punchTime?: string;
  captureLat?: number;
  captureLng?: number;
}

export class OfflineSyncDto {
  punches: MarkAttendanceDto[];
}

export class ReviewActionDto {
  action: 'APPROVE' | 'REJECT' | 'REASSIGN' | 'FALSE_ALERT';
  remarks?: string;
  /** for REASSIGN: the correct employee. */
  reassignEmployeeId?: string;
}

export class DuplicateActionDto {
  action: 'APPROVE' | 'REJECT' | 'FALSE_ALERT';
  remarks?: string;
}

export class ManualCorrectionDto {
  employeeId: string;
  correctionType: 'ADD' | 'EDIT' | 'DELETE';
  attendanceId?: string;
  newPunchTime?: string;
  newPunchType?: 'IN' | 'OUT';
  reason?: string;
}

export class UpdateSettingsDto {
  faceMatchConfidence?: number;
  faceRetryConfidence?: number;
  duplicateThreshold?: number;
  minFaceSamples?: number;
  frameCaptureCount?: number;
  livenessRequired?: boolean;
  offlineSyncEnabled?: boolean;
}
