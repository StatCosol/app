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

  /** MIME type of the selfie (e.g. `image/jpeg`). Sent by the portal upload form. */
  @IsOptional()
  @IsString()
  photoMime?: string;

  /** @deprecated Ignored as of Phase 4c; admin-enrol always recomputes the
   *  embedding from `photoBase64` server-side. Kept in the DTO only so old
   *  clients don't get a 400 for an extra field. */
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

/**
 * Phase 4a: enroll a contractor employee's face. Mirrors EnrollFaceDto but
 * targets `contractor_employees.id` (a separate table) so contractor
 * lifecycle is decoupled from the in-house workforce.
 */
export class EnrollContractorFaceDto {
  @IsUUID()
  contractorEmployeeId!: string;

  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  photoMime?: string;

  /** @deprecated Ignored as of Phase 4c; contractor admin-enrol always
   *  recomputes the embedding from `photoBase64` server-side. */
  @IsOptional()
  @IsString()
  embeddingBase64?: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

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

  /**
   * Phase 3f: on-device probe embedding (192-d Float32 little-endian,
   * base64-encoded — same encoding as RosterEntry.embeddingB64). When
   * present the server recomputes the cosine match against the stored
   * enrollment and overrides `matchScore` with that server-computed value.
   * Old APKs that omit this field fall through to the legacy device-trusted
   * `matchScore` gate.
   */
  @IsOptional()
  @IsString()
  probeEmbeddingB64?: string;

  /** Optional captured photo (base64, no data: prefix) for audit / Azure verify. */
  @IsOptional()
  @IsString()
  photoB64?: string;

  /** True when Android Location.isFromMockProvider() reported a fake provider. */
  @IsOptional()
  @IsBoolean()
  isMockLocation?: boolean;

  /** True when the device root-integrity probe (su binary / Magisk) returned positive. */
  @IsOptional()
  @IsBoolean()
  isRooted?: boolean;

  /** Set true by the offline queue worker so the server skips the strict clock-skew gate. */
  @IsOptional()
  @IsBoolean()
  offlineSync?: boolean;

  /**
   * Active-liveness challenge that the user passed on-device immediately
   * before this punch (Phase 3d). One of BLINK | HEAD_TURN_LEFT |
   * HEAD_TURN_RIGHT | SMILE. Required when FACE_LIVENESS_CHALLENGE_REQUIRED
   * is true on the server.
   */
  @IsOptional()
  @IsIn(['BLINK', 'HEAD_TURN_LEFT', 'HEAD_TURN_RIGHT', 'SMILE'])
  livenessChallengeType?:
    | 'BLINK'
    | 'HEAD_TURN_LEFT'
    | 'HEAD_TURN_RIGHT'
    | 'SMILE';

  /** ISO timestamp at which the on-device challenge was satisfied. */
  @IsOptional()
  @IsString()
  livenessChallengePassedAt?: string;

  /**
   * Phase 4c: server-issued single-use liveness nonce. Obtained from
   * POST /mobile-attendance/liveness/challenge and atomically consumed
   * by the server during punch validation when
   * FACE_LIVENESS_CHALLENGE_REQUIRED is true.
   */
  @IsOptional()
  @IsString()
  livenessNonce?: string;
}

export class MobilePunchBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobilePunchDto)
  punches!: MobilePunchDto[];
}

export class DeviceFailedScanDto {
  @IsIn([
    'FACE_MISMATCH',
    'MULTI_FACE',
    'QUALITY_LOW',
    'LIVENESS_FAIL',
    'OTHER',
  ])
  reason!:
    | 'FACE_MISMATCH'
    | 'MULTI_FACE'
    | 'QUALITY_LOW'
    | 'LIVENESS_FAIL'
    | 'OTHER';

  @IsOptional()
  @IsString()
  reasonDetail?: string;

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
  @IsNumber()
  captureLat?: number;

  @IsOptional()
  @IsNumber()
  captureLng?: number;
}

// ---------------------------------------------------------------------------
// Phase 4d: contractor kiosk punch. Mirrors MobilePunchDto but keyed by
// contractor_employees.id and routed to a parallel write path so existing
// payroll roll-ups stay untouched.
// ---------------------------------------------------------------------------

export class ContractorMobilePunchDto {
  @IsUUID()
  contractorEmployeeId!: string;

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

  /** Phase 3f: see MobilePunchDto.probeEmbeddingB64. */
  @IsOptional()
  @IsString()
  probeEmbeddingB64?: string;

  @IsOptional()
  @IsString()
  photoB64?: string;

  @IsOptional()
  @IsBoolean()
  isMockLocation?: boolean;

  @IsOptional()
  @IsBoolean()
  isRooted?: boolean;

  @IsOptional()
  @IsBoolean()
  offlineSync?: boolean;

  @IsOptional()
  @IsIn(['BLINK', 'HEAD_TURN_LEFT', 'HEAD_TURN_RIGHT', 'SMILE'])
  livenessChallengeType?:
    | 'BLINK'
    | 'HEAD_TURN_LEFT'
    | 'HEAD_TURN_RIGHT'
    | 'SMILE';

  @IsOptional()
  @IsString()
  livenessChallengePassedAt?: string;

  /** Phase 4c: see MobilePunchDto.livenessNonce. */
  @IsOptional()
  @IsString()
  livenessNonce?: string;
}

export class UpdateContractorPunchDto {
  @IsOptional()
  @IsString()
  punchTime?: string;

  @IsOptional()
  @IsIn(['IN', 'OUT', 'AUTO'])
  direction?: 'IN' | 'OUT' | 'AUTO';
}

export class CreateContractorPunchAdminDto {
  @IsUUID()
  contractorEmployeeId!: string;

  @IsString()
  punchTime!: string;

  @IsIn(['IN', 'OUT', 'AUTO'])
  direction!: 'IN' | 'OUT' | 'AUTO';
}

// ---------------------------------------------------------------------------
// Phase 3e: re-enrollment approval workflow.
// ---------------------------------------------------------------------------

export class CreateReenrollRequestDto {
  @IsUUID()
  employeeId!: string;

  /** Base64 of the candidate embedding (same encoding as EnrollFaceDto). */
  @IsString()
  embeddingBase64!: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

  /** Optional photo to attach for the reviewer (base64 JPEG, no data: prefix). */
  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'ESS', 'KIOSK'])
  source?: 'ADMIN' | 'ESS' | 'KIOSK';
}

export class ReviewReenrollRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  notes?: string;
}

// ---------------------------------------------------------------------------
// Phase 4c: contractor re-enrollment approval workflow (mirror of
// CreateReenrollRequestDto / ReviewReenrollRequestDto, keyed by
// contractor_employees.id).
// ---------------------------------------------------------------------------

export class CreateContractorReenrollRequestDto {
  @IsUUID()
  contractorEmployeeId!: string;

  /** Base64 of the candidate embedding (same encoding as EnrollContractorFaceDto). */
  @IsString()
  embeddingBase64!: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

  /** Optional photo to attach for the reviewer (base64 JPEG, no data: prefix). */
  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'ESS', 'KIOSK'])
  source?: 'ADMIN' | 'ESS' | 'KIOSK';
}

/**
 * Branch / client user creates a kiosk-supervised enrollment ticket targeting
 * one KIOSK-mode device + one employee (or contractor employee). The kiosk
 * picks up the ticket on its next poll, captures live frames, and submits the
 * embedding back via {@link SubmitKioskEnrollDto}.
 */
export class CreateKioskEnrollTicketDto {
  @IsUUID()
  deviceId!: string;

  @IsIn(['EMPLOYEE', 'CONTRACTOR'])
  subjectType!: 'EMPLOYEE' | 'CONTRACTOR';

  @IsUUID()
  subjectId!: string;

  @IsBoolean()
  consentGiven!: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Body the kiosk POSTs back when it has captured + embedded the subject. */
export class SubmitKioskEnrollDto {
  /** 192-d Float32 embedding, base64-encoded (little-endian, L2-normalized). */
  @IsString()
  embeddingBase64!: string;

  @IsOptional()
  @IsString()
  embeddingModel?: string;

  @IsOptional()
  @IsString()
  photoBase64?: string;

  /** Cosine of probe-vs-average across the captured frames; quality signal. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  selfMatchScore?: number;
}

export class ReviewKioskEnrollTicketDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reason?: string;
}
