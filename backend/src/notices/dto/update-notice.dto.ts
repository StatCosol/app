import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateNoticeDto {
  @IsOptional() @IsString()
  noticeType?: string;

  @IsOptional() @IsString()
  departmentName?: string;

  @IsOptional() @IsString()
  referenceNo?: string;

  @IsOptional() @IsString()
  subject?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsDateString()
  responseDueDate?: string;

  @IsOptional() @IsString()
  severity?: string;

  @IsOptional() @IsString()
  assignedToUserId?: string;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  responseSummary?: string;

  @IsOptional() @IsDateString()
  responseDate?: string;

  @IsOptional() @IsString()
  closureRemarks?: string;

  @IsOptional() @IsString()
  remarks?: string;
}
