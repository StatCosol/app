import { IsNotEmpty, IsOptional, IsString, IsUUID, IsIn, IsDateString } from 'class-validator';
import { AppraisalType, CycleStatus } from '../enums/appraisal.enums';

export class CreateAppraisalCycleDto {
  @IsString() @IsNotEmpty()
  cycleCode: string;

  @IsString() @IsNotEmpty()
  cycleName: string;

  @IsString() @IsNotEmpty()
  financialYear: string;

  @IsString() @IsIn(Object.values(AppraisalType))
  appraisalType: string;

  @IsDateString() @IsNotEmpty()
  reviewPeriodFrom: string;

  @IsDateString() @IsNotEmpty()
  reviewPeriodTo: string;

  @IsDateString() @IsOptional()
  effectiveDate?: string;

  @IsUUID() @IsOptional()
  templateId?: string;

  @IsOptional()
  scopes?: {
    branchId?: string;
    departmentId?: string;
    designationId?: string;
    employmentType?: string;
  }[];
}

export class UpdateAppraisalCycleDto {
  @IsString() @IsOptional()
  cycleName?: string;

  @IsString() @IsOptional()
  financialYear?: string;

  @IsString() @IsIn(Object.values(AppraisalType)) @IsOptional()
  appraisalType?: string;

  @IsDateString() @IsOptional()
  reviewPeriodFrom?: string;

  @IsDateString() @IsOptional()
  reviewPeriodTo?: string;

  @IsDateString() @IsOptional()
  effectiveDate?: string;

  @IsUUID() @IsOptional()
  templateId?: string;

  @IsString() @IsIn(Object.values(CycleStatus)) @IsOptional()
  status?: string;
}
