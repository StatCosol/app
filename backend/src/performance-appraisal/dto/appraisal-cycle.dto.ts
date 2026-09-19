import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  IsDateString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AppraisalType, CycleStatus } from '../enums/appraisal.enums';

/**
 * One targeting row of a cycle. Columns are uuid / varchar(30).
 *
 * This was an inline `{ ... }[]` type with no validation. Under the global
 * pipe's implicit conversion each scope arrived as `[]` (see
 * global-validation-pipe.ts), so every scope row was saved all-NULL — and a
 * NULL branch_id matches every branch in the cycle listing. A cycle limited to
 * one branch became visible to all of them, while AppraisalScopeGuard had
 * approved the branch ids in the raw body the service never saw.
 */
export class AppraisalCycleScopeDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  employmentType?: string;
}

export class CreateAppraisalCycleDto {
  @IsString()
  @IsNotEmpty()
  cycleCode: string;

  @IsString()
  @IsNotEmpty()
  cycleName: string;

  @IsString()
  @IsNotEmpty()
  financialYear: string;

  @IsString()
  @IsIn(Object.values(AppraisalType))
  appraisalType: string;

  @IsDateString()
  @IsNotEmpty()
  reviewPeriodFrom: string;

  @IsDateString()
  @IsNotEmpty()
  reviewPeriodTo: string;

  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @IsUUID()
  @IsOptional()
  templateId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppraisalCycleScopeDto)
  scopes?: AppraisalCycleScopeDto[];
}

export class UpdateAppraisalCycleDto {
  @IsString()
  @IsOptional()
  cycleName?: string;

  @IsString()
  @IsOptional()
  financialYear?: string;

  @IsString()
  @IsIn(Object.values(AppraisalType))
  @IsOptional()
  appraisalType?: string;

  @IsDateString()
  @IsOptional()
  reviewPeriodFrom?: string;

  @IsDateString()
  @IsOptional()
  reviewPeriodTo?: string;

  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @IsUUID()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsIn(Object.values(CycleStatus))
  @IsOptional()
  status?: string;
}
