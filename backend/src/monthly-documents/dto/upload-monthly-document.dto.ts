import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UploadMonthlyDocumentDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  month: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
