import {
  IsIn,
  MaxLength,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class UploadCrmDocumentDto {
  @IsOptional()
  @IsUUID()
  registrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  registrationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  authority?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  noExpiry?: string;

  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['COMPANY', 'BRANCH'])
  scope?: 'COMPANY' | 'BRANCH';

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
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Use a calendar date (YYYY-MM-DD)',
  })
  @IsDateString({ strict: true })
  periodFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Use a calendar date (YYYY-MM-DD)',
  })
  @IsDateString({ strict: true })
  periodTo?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
