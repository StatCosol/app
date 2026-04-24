import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsInt,
  IsIn,
} from 'class-validator';

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
}

export class CreatePayrollComponentDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER', 'INFO'])
  componentType?: 'EARNING' | 'DEDUCTION' | 'EMPLOYER' | 'INFO';
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

export class SaveSlabsDto {
  slabs: any[];
}

export class RejectRegisterDto {
  @IsOptional() @IsString() reason?: string;
}
