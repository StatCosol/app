import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class UploadComplianceDocumentDto {
  @IsNotEmpty()
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsNotEmpty()
  @IsEnum(['RETURN', 'REGISTER', 'LICENSE', 'MCD', 'AUDIT_REPORT'])
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subCategory?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

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
  @MaxLength(30)
  periodLabel?: string;
}
