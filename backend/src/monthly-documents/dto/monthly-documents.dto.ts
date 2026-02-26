import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UploadMonthlyDocumentDto {
  @IsNotEmpty()
  @IsString()
  branchId!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month!: string;

  @IsNotEmpty()
  @IsString()
  code!: string;
}

export class ListMonthlyDocumentsDto {
  @IsNotEmpty()
  @IsString()
  branchId!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
