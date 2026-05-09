import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UploadSafetyDocumentDto {
  @IsNotEmpty()
  @IsString()
  branchId: string;

  @IsNotEmpty()
  @IsString()
  documentType: string;

  @IsNotEmpty()
  @IsString()
  documentName: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  applicableTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  periodMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  periodQuarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  periodYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  masterDocumentId?: number;
}
