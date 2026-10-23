import { Type } from 'class-transformer';
import {
  IsString,
  IsIn,
  IsUUID,
  ValidateIf,
  IsOptional,
  IsInt,
  IsNotEmpty,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class UploadComplianceDocDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  returnCode: string;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2050)
  periodYear: number;

  @IsString()
  @IsIn(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'])
  frequency: string; // MONTHLY | QUARTERLY | HALF_YEARLY | YEARLY

  @ValidateIf((o) => o.frequency === 'MONTHLY' || o.periodMonth !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @ValidateIf(
    (o) => o.frequency === 'QUARTERLY' || o.periodQuarter !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  periodQuarter?: number;

  @ValidateIf(
    (o) => o.frequency === 'HALF_YEARLY' || o.periodHalf !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  periodHalf?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CrmUploadComplianceDocDto extends UploadComplianceDocDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;
}

export class MarkNotApplicableDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  returnCode: string;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2050)
  periodYear: number;

  @IsString()
  @IsIn(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'])
  frequency: string;

  @ValidateIf((o) => o.frequency === 'MONTHLY' || o.periodMonth !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @ValidateIf(
    (o) => o.frequency === 'QUARTERLY' || o.periodQuarter !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  periodQuarter?: number;

  @ValidateIf(
    (o) => o.frequency === 'HALF_YEARLY' || o.periodHalf !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  periodHalf?: number;

  @IsString()
  @IsNotEmpty()
  remarks: string;
}

export class ReviewComplianceDocDto {
  @IsString()
  @IsNotEmpty()
  status: 'APPROVED' | 'REUPLOAD_REQUIRED';

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ChecklistQueryDto {
  @IsOptional()
  @IsIn(['ACTUAL', 'TEST'])
  recordScope?: 'ACTUAL' | 'TEST';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  monthKey?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  half?: number;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  lawArea?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  appliesTo?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}

export class ReturnMasterQueryDto {
  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  applicableFor?: string;

  @IsOptional()
  @IsString()
  lawArea?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @IsString()
  appliesTo?: string;

  @IsOptional()
  @IsString()
  responsibleRole?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;

  @IsOptional()
  isActive?: boolean;
}

export class CreateReturnMasterDto {
  @IsString()
  @IsNotEmpty()
  returnCode: string;

  @IsString()
  @IsNotEmpty()
  returnName: string;

  @IsString()
  @IsNotEmpty()
  lawArea: string;

  @IsString()
  @IsNotEmpty()
  frequency: string;

  @IsOptional()
  @IsString()
  scopeDefault?: string;

  @IsOptional()
  @IsString()
  applicableFor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dueDay?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @IsString()
  appliesTo?: string;

  @IsOptional()
  uploadRequired?: boolean;

  @IsOptional()
  @IsString()
  dueDateRule?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;

  @IsOptional()
  @IsString()
  responsibleRole?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateReturnMasterDto {
  @IsOptional()
  @IsString()
  returnName?: string;

  @IsOptional()
  @IsString()
  lawArea?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  scopeDefault?: string;

  @IsOptional()
  @IsString()
  applicableFor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dueDay?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @IsString()
  appliesTo?: string;

  @IsOptional()
  uploadRequired?: boolean;

  @IsOptional()
  @IsString()
  dueDateRule?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;

  @IsOptional()
  @IsString()
  responsibleRole?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  isActive?: boolean;
}
