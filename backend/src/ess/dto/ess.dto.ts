import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';

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
  @IsOptional() @IsString() deviceInfo?: string;
}

export class EssCheckOutDto {
  @IsOptional() @IsString() captureMethod?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() deviceInfo?: string;
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
  @IsOptional() @IsArray() members?: any[];
}

export class ResubmitNominationDto {
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;
  @IsOptional() @IsString() declarationDate?: string;
  @IsOptional() @IsArray() members?: any[];
}

export class UpdateEssNominationDto {
  @IsOptional() @IsBoolean() asDraft?: boolean;
  @IsOptional() @IsString() declarationDate?: string;
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;
  @IsOptional() @IsArray() members?: any[];
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
