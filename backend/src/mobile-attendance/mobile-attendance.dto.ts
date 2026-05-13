import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterMobileDeviceDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsIn(['KIOSK', 'ESS'])
  mode!: 'KIOSK' | 'ESS';

  @IsOptional()
  @IsString()
  deviceLabel?: string;

  @IsOptional()
  @IsNumber()
  geofenceLat?: number;

  @IsOptional()
  @IsNumber()
  geofenceLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(5000)
  geofenceRadiusM?: number;

  /** Required when `mode === 'ESS'` — binds the personal phone to one employee. */
  @IsOptional()
  @IsUUID()
  essEmployeeId?: string;
}

export class EnrollFaceDto {
  @IsUUID()
  employeeId!: string;

  /** Base64 (no data: prefix) JPEG/PNG selfie. Required for Azure-Face enrollment. */
  @IsOptional()
  @IsString()
  photoBase64?: string;

  /** 128/512-d Float32 embedding, base64-encoded, generated on-device (MobileFaceNet). */
  @IsOptional()
  @IsString()
  embeddingBase64?: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

  /** Explicit DPDP-Act consent flag — must be true to enroll. */
  @IsBoolean()
  consentGiven!: boolean;
}

/** Payload posted by the Android ESS app from the bound employee's own phone. */
export class EnrollSelfDto {
  /** 192-d Float32 embedding, base64-encoded, generated on-device. */
  @IsString()
  embeddingBase64!: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsBoolean()
  consentGiven!: boolean;
}

export class MobilePunchDto {
  /** Identified employee (kiosk: from on-device match; ESS: from device binding). */
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  /** ISO timestamp of capture. */
  @IsString()
  punchTime!: string;

  @IsIn(['IN', 'OUT', 'AUTO'])
  @IsOptional()
  direction?: 'IN' | 'OUT' | 'AUTO';

  @IsOptional()
  @IsNumber()
  captureLat?: number;

  @IsOptional()
  @IsNumber()
  captureLng?: number;

  @IsOptional()
  @IsNumber()
  captureAccuracyM?: number;

  /** Cosine similarity (on-device match) 0..1. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  matchScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  livenessScore?: number;

  @IsOptional()
  @IsString()
  matchProvider?: string;

  /** Optional captured photo (base64, no data: prefix) for audit / Azure verify. */
  @IsOptional()
  @IsString()
  photoB64?: string;
}

export class MobilePunchBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobilePunchDto)
  punches!: MobilePunchDto[];
}
