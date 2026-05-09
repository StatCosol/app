import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CalendarQueryDto {
  @IsISO8601()
  from: string; // YYYY-MM-DD

  @IsISO8601()
  to: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  clientId?: string; // required for CRM / ADMIN / CCO / CEO

  @IsOptional()
  @IsString()
  module?: 'REGISTRATION' | 'MCD' | 'RETURNS';
}
