import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Component DTO ─────────────────────────────────────────────────────────────

export class CreateStructureComponentDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsString() label: string;

  @IsIn(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'])
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';

  @IsIn(['FIXED', 'PERCENTAGE', 'FORMULA', 'BALANCING', 'CONDITIONAL_FIXED'])
  calculationMethod:
    | 'FIXED'
    | 'PERCENTAGE'
    | 'FORMULA'
    | 'BALANCING'
    | 'CONDITIONAL_FIXED';

  @IsInt() displayOrder: number;

  @IsOptional() @IsNumber() fixedValue?: number;
  @IsOptional() @IsNumber() percentageValue?: number;
  @IsOptional() @IsString() basedOn?: string;
  @IsOptional() @IsString() formula?: string;

  @IsOptional()
  @IsIn(['NONE', 'ROUND', 'ROUND_UP', 'ROUND_DOWN'])
  roundRule?: 'NONE' | 'ROUND' | 'ROUND_UP' | 'ROUND_DOWN';

  @IsOptional() @IsBoolean() taxable?: boolean;
  @IsOptional() @IsBoolean() statutory?: boolean;
  @IsOptional() @IsBoolean() isVisibleInPayslip?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Statutory config DTO ──────────────────────────────────────────────────────

export class CreateStatutoryConfigDto {
  @IsString() stateCode: string;

  @IsOptional() @IsNumber() minimumWage?: number;
  @IsOptional() @IsBoolean() warnIfGrossBelowMinWage?: boolean;
  @IsOptional() @IsBoolean() enablePt?: boolean;
  @IsOptional() @IsBoolean() enablePf?: boolean;
  @IsOptional() @IsBoolean() enableEsi?: boolean;
  @IsOptional() @IsNumber() pfEmployeeRate?: number;
  @IsOptional() @IsNumber() pfWageCap?: number;
  @IsOptional() @IsNumber() pfApplyIfGrossAbove?: number;
  @IsOptional() @IsNumber() esiEmployeeRate?: number;
  @IsOptional() @IsNumber() esiEmployerRate?: number;
  @IsOptional() @IsNumber() esiGrossCeiling?: number;
  @IsOptional() @IsBoolean() carryForwardLeave?: boolean;
  @IsOptional() @IsNumber() monthlyPaidLeaveAccrual?: number;
  @IsOptional() @IsNumber() attendanceBonusAmount?: number;
  @IsOptional() @IsNumber() attendanceBonusIfLopLte?: number;
}

// ── Structure DTO ─────────────────────────────────────────────────────────────

export class CreateClientStructureDto {
  @IsUUID() clientId: string;
  @IsString() name: string;
  @IsString() code: string;

  @IsOptional() @IsInt() version?: number;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStructureComponentDto)
  components: CreateStructureComponentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStatutoryConfigDto)
  statutoryConfigs: CreateStatutoryConfigDto[];
}

// ── Update DTO (partial) ─────────────────────────────────────────────────────

export class UpdateClientStructureDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

// ── Calculate DTO ─────────────────────────────────────────────────────────────

export class CalculatePayrollDto {
  @IsNumber() gross: number;
  @IsNumber() lopDays: number;
  @IsString() stateCode: string;
  @IsInt() month: number;
  @IsInt() year: number;
}
