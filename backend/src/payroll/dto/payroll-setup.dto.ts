import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsInt,
  IsIn,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertPayrollSetupDto {
  @IsOptional() @IsBoolean() pfEnabled?: boolean;
  @IsOptional() @IsBoolean() esiEnabled?: boolean;
  @IsOptional() @IsBoolean() ptEnabled?: boolean;
  @IsOptional() @IsBoolean() lwfEnabled?: boolean;
  @IsOptional() @IsString() pfEmployerRate?: string;
  @IsOptional() @IsString() pfEmployeeRate?: string;
  @IsOptional() @IsString() esiEmployerRate?: string;
  @IsOptional() @IsString() esiEmployeeRate?: string;
  @IsOptional() @IsString() pfWageCeiling?: string;
  @IsOptional() @IsString() pfGrossThreshold?: string;
  @IsOptional() @IsString() esiWageCeiling?: string;
  @IsOptional() @IsString() payCycle?: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsInt() cycleStartDay?: number;
  @IsOptional() @IsInt() payoutDay?: number;
  @IsOptional() @IsInt() lockDay?: number;
  @IsOptional() @IsString() arrearMode?: string;
  @IsOptional() @IsString() leaveAccrualPerMonth?: string;
  @IsOptional() @IsNumber() maxCarryForward?: number;
  @IsOptional() @IsBoolean() allowCarryForward?: boolean;
  @IsOptional() @IsString() lopMode?: string;
  @IsOptional() @IsString() attendanceSource?: string;
  @IsOptional() @IsInt() attendanceCutoffDay?: number;
  @IsOptional() @IsInt() graceMinutes?: number;
  @IsOptional() @IsBoolean() autoLockAttendance?: boolean;
  @IsOptional() @IsBoolean() syncEnabled?: boolean;
  @IsOptional() @IsBoolean() enableLoanRecovery?: boolean;
  @IsOptional() @IsBoolean() enableAdvanceRecovery?: boolean;
  @IsOptional() @IsString() defaultDeductionCapPct?: string;
  @IsOptional() @IsString() recoveryOrder?: string;
  @IsOptional()
  @IsIn(['FIXED_26', 'CALENDAR_DAYS', 'WORKING_DAYS'])
  wageBasisDays?: 'FIXED_26' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  @IsOptional() @IsString() otMultiplier?: string;
  @IsOptional() @IsString() otHoursPerDay?: string;
  @IsOptional() @IsString() otDaysInMonth?: string;
}

export class CreatePayrollComponentDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER', 'INFO'])
  componentType?: 'EARNING' | 'DEDUCTION' | 'EMPLOYER' | 'INFO';
  @IsOptional() @IsBoolean() isTaxable?: boolean;
  @IsOptional() @IsBoolean() affectsPfWage?: boolean;
  @IsOptional() @IsBoolean() affectsEsiWage?: boolean;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePayrollComponentDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER', 'INFO'])
  componentType?: 'EARNING' | 'DEDUCTION' | 'EMPLOYER' | 'INFO';
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreatePayrollRuleDto {
  @IsOptional() @IsIn(['FIXED', 'PERCENTAGE', 'SLAB', 'FORMULA']) ruleType?:
    | 'FIXED'
    | 'PERCENTAGE'
    | 'SLAB'
    | 'FORMULA';
}

export class UpdatePayrollRuleDto {
  @IsOptional() @IsIn(['FIXED', 'PERCENTAGE', 'SLAB', 'FORMULA']) ruleType?:
    | 'FIXED'
    | 'PERCENTAGE'
    | 'SLAB'
    | 'FORMULA';
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * One band of a SLAB rule. Columns: numeric(14,2) amounts, numeric(8,4) pct.
 *
 * `id` and `ruleId` are accepted because listSlabs() returns them and a save
 * screen will send a listed slab straight back — rejecting them would make the
 * round trip fail. saveSlabs() ignores both: it replaces the rule's slabs and
 * takes the rule from the path.
 */
export class SlabDto {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsUUID() ruleId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  fromAmount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  toAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9999.9999)
  slabPct?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999999.99)
  slabFixed?: number | null;
}

/**
 * This had no decorator, so the global pipe (forbidNonWhitelisted) rejected
 * every request with "property slabs should not exist" — and had it not, each
 * slab would have been spread unchecked into the entity. Nothing in the
 * frontend calls the endpoint yet; it is fixed so the first caller works.
 */
export class SaveSlabsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SlabDto)
  slabs: SlabDto[];
}

export class RejectRegisterDto {
  @IsOptional() @IsString() reason?: string;
}
