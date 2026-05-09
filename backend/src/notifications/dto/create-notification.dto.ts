import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @MinLength(3)
  subject: string;

  @IsIn(['TECHNICAL', 'COMPLIANCE', 'AUDIT', 'GENERAL'])
  queryType: 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL';

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
