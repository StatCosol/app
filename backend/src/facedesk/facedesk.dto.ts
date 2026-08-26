/**
 * FaceDesk V2 request DTOs.
 *
 * The global ValidationPipe runs with whitelist + forbidNonWhitelisted, so
 * every property MUST carry a class-validator decorator or the request is
 * rejected. Frames are validated element-by-element via @ValidateNested.
 *
 * Frame model: the kiosk captures 10-15 frames and sends them either as
 * device-computed embeddings (works offline) or as base64 photos (server
 * embeds via face-svc), plus optional device quality/liveness.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class FaceFrameDto {
  @IsOptional()
  @IsString()
  embeddingB64?: string;

  @IsOptional()
  @IsString()
  photoB64?: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

  @IsOptional()
  @IsNumber()
  qualityScore?: number;

  @IsOptional()
  @IsNumber()
  livenessScore?: number;

  @IsOptional()
  @IsIn(['FRONT', 'LEFT', 'RIGHT', 'EXPRESSION', 'LIVENESS'])
  sampleType?: 'FRONT' | 'LEFT' | 'RIGHT' | 'EXPRESSION' | 'LIVENESS';
}

export class SaveEnrollmentDto {
  @IsString()
  employeeId: string;

  /** EMPLOYEE (default) or CONTRACTOR — which roster employeeId belongs to. */
  @IsOptional()
  @IsIn(['EMPLOYEE', 'CONTRACTOR'])
  subjectType?: 'EMPLOYEE' | 'CONTRACTOR';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaceFrameDto)
  frames: FaceFrameDto[];

  @IsOptional()
  @IsString()
  photoB64?: string;

  @IsOptional()
  @IsBoolean()
  livenessPassed?: boolean;

  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;
}

export class ValidateQualityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaceFrameDto)
  frames: FaceFrameDto[];
}

export class CheckDuplicateDto {
  @IsString()
  employeeId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaceFrameDto)
  frames: FaceFrameDto[];
}

export class MarkAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaceFrameDto)
  frames: FaceFrameDto[];

  /** PIN_THEN_FACE: the employee code the person entered on the kiosk. */
  @IsOptional()
  @IsString()
  employeeCode?: string;

  /** PIN_THEN_FACE: the attendance PIN the person entered on the kiosk. */
  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  photoB64?: string;

  @IsOptional()
  @IsBoolean()
  livenessPassed?: boolean;

  @IsOptional()
  @IsString()
  offlineRef?: string;

  @IsOptional()
  @IsString()
  punchTime?: string;

  @IsOptional()
  @IsNumber()
  captureLat?: number;

  @IsOptional()
  @IsNumber()
  captureLng?: number;

  /** Kiosk telemetry — reported on each punch for ops monitoring. */
  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsNumber()
  offlineQueueDepth?: number;
}

export class OfflineSyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  punches: MarkAttendanceDto[];

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsNumber()
  offlineQueueDepth?: number;
}

export class ReviewActionDto {
  @IsIn(['APPROVE', 'REJECT', 'REASSIGN', 'FALSE_ALERT'])
  action: 'APPROVE' | 'REJECT' | 'REASSIGN' | 'FALSE_ALERT';

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  reassignEmployeeId?: string;
}

export class DuplicateActionDto {
  @IsIn(['APPROVE', 'REJECT', 'FALSE_ALERT'])
  action: 'APPROVE' | 'REJECT' | 'FALSE_ALERT';

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class DayReviewActionDto {
  @IsString()
  employeeId: string;

  /** IST business day, YYYY-MM-DD. */
  @IsString()
  workDate: string;

  /** FULL_DAY → 1.0, HALF_DAY → 0.5, REJECT → 0 (absent). */
  @IsIn(['FULL_DAY', 'HALF_DAY', 'REJECT'])
  action: 'FULL_DAY' | 'HALF_DAY' | 'REJECT';

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ManualCorrectionDto {
  @IsString()
  employeeId: string;

  @IsIn(['ADD', 'EDIT', 'DELETE'])
  correctionType: 'ADD' | 'EDIT' | 'DELETE';

  @IsOptional()
  @IsString()
  attendanceId?: string;

  @IsOptional()
  @IsString()
  newPunchTime?: string;

  @IsOptional()
  @IsIn(['IN', 'OUT'])
  newPunchType?: 'IN' | 'OUT';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateEnrollTicketDto {
  @IsString()
  employeeId: string;

  @IsString()
  deviceId: string;

  /** EMPLOYEE (default) or CONTRACTOR — which roster employeeId belongs to. */
  @IsOptional()
  @IsIn(['EMPLOYEE', 'CONTRACTOR'])
  subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  faceMatchConfidence?: number;

  @IsOptional()
  @IsNumber()
  faceRetryConfidence?: number;

  @IsOptional()
  @IsNumber()
  duplicateThreshold?: number;

  @IsOptional()
  @IsNumber()
  minFaceSamples?: number;

  @IsOptional()
  @IsNumber()
  frameCaptureCount?: number;

  @IsOptional()
  @IsBoolean()
  livenessRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  offlineSyncEnabled?: boolean;

  /** HH:MM (24h) late-coming threshold for reports. */
  @IsOptional()
  @IsString()
  shiftStartTime?: string | null;

  /** HH:MM (24h) early-going threshold for reports. */
  @IsOptional()
  @IsString()
  shiftEndTime?: string | null;
}

export class SetAttendancePinDto {
  /** Target employee by id… */
  @IsOptional()
  @IsString()
  employeeId?: string;

  /** …or by employee code (either identifies the employee). */
  @IsOptional()
  @IsString()
  employeeCode?: string;

  /** Optional explicit 4–6 digit PIN; omitted → server generates one. */
  @IsOptional()
  @IsString()
  pin?: string;
}
