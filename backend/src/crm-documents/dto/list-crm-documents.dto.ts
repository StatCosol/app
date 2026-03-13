import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class ListCrmDocumentsDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM format' })
  month?: string;

  @IsOptional()
  @IsString()
  lawCategory?: string;

  @IsOptional()
  @IsString()
  documentType?: string;
}
