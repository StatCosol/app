import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsNotEmpty,
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

  @IsInt()
  @Min(2020)
  @Max(2050)
  periodYear: number;

  @IsString()
  @IsNotEmpty()
  frequency: string; // MONTHLY | QUARTERLY | HALF_YEARLY | YEARLY

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  periodQuarter?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  periodHalf?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
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
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsInt()
  month?: number;

  @IsOptional()
  @IsInt()
  quarter?: number;

  @IsOptional()
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
  @IsInt()
  page?: number;

  @IsOptional()
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
  @IsInt()
  dueDay?: number;

  @IsOptional()
  @IsString()
  category?: string;
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
  @IsInt()
  dueDay?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  isActive?: boolean;
}
