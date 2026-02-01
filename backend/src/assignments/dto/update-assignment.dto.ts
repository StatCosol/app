import { IsOptional, IsUUID, IsString, IsDateString } from 'class-validator';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsUUID()
  crmId?: string | null;

  @IsOptional()
  @IsUUID()
  auditorId?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
