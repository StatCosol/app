import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';

export class ListComplianceDocumentsDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(['RETURN', 'REGISTER', 'LICENSE', 'MCD', 'AUDIT_REPORT'])
  category?: string;

  @IsOptional()
  @IsString()
  subCategory?: string;

  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2099)
  periodYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
