import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  noticeType?: string;

  @IsString()
  @IsNotEmpty()
  departmentName: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  noticeDate: string;

  @IsDateString()
  receivedDate: string;

  @IsOptional()
  @IsDateString()
  responseDueDate?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}
