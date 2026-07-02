import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class RaiseNotificationDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsIn(['TECHNICAL', 'COMPLIANCE', 'AUDIT'])
  queryType: 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT';

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsIn(['AUDIT', 'ASSIGNMENT', 'COMPLIANCE', 'SYSTEM'])
  contextType?: 'AUDIT' | 'ASSIGNMENT' | 'COMPLIANCE' | 'SYSTEM';

  @IsOptional()
  @IsString()
  contextRefId?: string;
}
