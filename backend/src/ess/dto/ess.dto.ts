import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsObject,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A nominee as the ESS forms send it. A type only: the objects are not
 * validated field by field here, validateNominationMembers() in the service is
 * what checks them, and the service copies these named fields and nothing else.
 */
export interface NominationMemberInput {
  memberName?: string;
  relationship?: string;
  dateOfBirth?: string;
  sharePct?: number;
  address?: string;
  isMinor?: boolean;
  guardianName?: string;
  guardianRelationship?: string;
  guardianAddress?: string;
}

// ── Profile ──────────────────────────────────────────────
export class UpdateEssProfileDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() fatherName?: string;
  @IsOptional() @IsString() maritalStatus?: string;
}

// ── Attendance ───────────────────────────────────────────
export class EssCheckInDto {
  @IsOptional() @IsString() captureMethod?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsNumber() accuracy?: number;
  @IsOptional() @IsString() deviceInfo?: string;
  // Optional base64-encoded selfie (without the data: URL prefix) when
  // captureMethod === 'FACE'. Captured client-side via getUserMedia. Not
  // currently persisted server-side — accepted so the validation pipe
  // (forbidNonWhitelisted: true) does not reject the request.
  @IsOptional() @IsString() selfieB64?: string;
}

export class EssCheckOutDto {
  @IsOptional() @IsString() captureMethod?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsNumber() accuracy?: number;
  @IsOptional() @IsString() deviceInfo?: string;
  @IsOptional() @IsString() selfieB64?: string;
}

export class SubmitShortWorkReasonDto {
  @IsOptional() @IsString() date?: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

// ── Nominations ──────────────────────────────────────────
export class CreateEssNominationDto {
  @IsString()
  @IsNotEmpty()
  nominationType: string;

  @IsOptional() @IsBoolean() asDraft?: boolean;
  @IsOptional() @IsString() declarationDate?: string;
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;
  /** Kept as sent; without @Type each nominee becomes `[]` (global-validation-pipe.ts). */
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Type(() => Object)
  members?: NominationMemberInput[];
}

export class ResubmitNominationDto {
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;
  @IsOptional() @IsString() declarationDate?: string;
  /** Kept as sent; without @Type each nominee becomes `[]` (global-validation-pipe.ts). */
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Type(() => Object)
  members?: NominationMemberInput[];
}

export class UpdateEssNominationDto {
  @IsOptional() @IsBoolean() asDraft?: boolean;
  @IsOptional() @IsString() declarationDate?: string;
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;
  /** Kept as sent; without @Type each nominee becomes `[]` (global-validation-pipe.ts). */
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Type(() => Object)
  members?: NominationMemberInput[];
}

// ── Leave ────────────────────────────────────────────────
export class ApplyLeaveDto {
  @IsString()
  @IsNotEmpty()
  leaveType: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsOptional() @IsNumber() totalDays?: number;
  @IsOptional() @IsString() reason?: string;
}

// ── Leave Policy (client management) ─────────────────────
export class CreateLeavePolicyDto {
  @IsString() @IsNotEmpty() leaveType: string;
  @IsString() @IsNotEmpty() leaveName: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() accrualMethod?: string;
  @IsOptional() @IsNumber() accrualRate?: number;
  @IsOptional() @IsNumber() carryForwardLimit?: number;
  @IsOptional() @IsNumber() yearlyLimit?: number;
  @IsOptional() @IsBoolean() allowNegative?: boolean;
  @IsOptional() @IsNumber() minNoticeDays?: number;
  @IsOptional() @IsNumber() maxDaysPerRequest?: number;
  @IsOptional() @IsBoolean() requiresDocument?: boolean;
}

export class UpdateLeavePolicyDto {
  @IsOptional() @IsString() leaveType?: string;
  @IsOptional() @IsString() leaveName?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() accrualMethod?: string;
  @IsOptional() @IsNumber() accrualRate?: number;
  @IsOptional() @IsNumber() carryForwardLimit?: number;
  @IsOptional() @IsNumber() yearlyLimit?: number;
  @IsOptional() @IsBoolean() allowNegative?: boolean;
  @IsOptional() @IsNumber() minNoticeDays?: number;
  @IsOptional() @IsNumber() maxDaysPerRequest?: number;
  @IsOptional() @IsBoolean() requiresDocument?: boolean;
}

// ── Approval rejection (simple reason) ───────────────────
export class RejectReasonDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() type?: string;
}
