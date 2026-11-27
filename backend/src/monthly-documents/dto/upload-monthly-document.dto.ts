import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class UploadMonthlyDocumentDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
