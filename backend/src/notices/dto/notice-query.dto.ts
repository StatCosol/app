import { IsOptional, IsString } from 'class-validator';

export class NoticeQueryDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  noticeType?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
