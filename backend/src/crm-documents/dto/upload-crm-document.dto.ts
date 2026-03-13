import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class UploadCrmDocumentDto {
  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM format' })
  month?: string;

  @IsString()
  @IsNotEmpty()
  lawCategory!: string;

  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @IsOptional()
  @IsString()
  periodFrom?: string;

  @IsOptional()
  @IsString()
  periodTo?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
