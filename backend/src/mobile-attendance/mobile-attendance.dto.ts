import {
  IsArray,
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
  consentGiven!: boolean;
}

export class MobilePunchDto {
  /** Identified employee (kiosk: from on-device match; ESS: from JWT). */
  @IsUUID()
  employeeId!: string;

  /** ISO timestamp of capture. */
  @IsString()
  capturedAt!: string;

  @IsIn(['IN', 'OUT', 'AUTO'])
  @IsOptional()
  direction?: 'IN' | 'OUT' | 'AUTO';

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsNumber()
  accuracyM?: number;

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

  /** Optional captured photo (base64) for audit / Azure verify. */
  @IsOptional()
  @IsString()
  photoBase64?: string;
}

export class MobilePunchBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobilePunchDto)
  punches!: MobilePunchDto[];
}
