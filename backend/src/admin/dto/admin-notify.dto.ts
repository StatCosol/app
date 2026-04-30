import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class AdminNotifyDto {
  @IsIn([
    'ADMIN',
    'CRM',
    'AUDITOR',
    'LEGITX',
    'CONTRACTOR',
    'PAYROLL',
    'CCO',
    'CEO',
  ])
  targetRole: string;

  @IsUUID()
  targetUserId: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsIn(['AUDIT', 'ASSIGNMENT', 'COMPLIANCE', 'SYSTEM'])
  contextType: string;

  @IsString()
  @IsNotEmpty()
  contextRefId: string;

  @IsOptional()
  @IsIn(['TECHNICAL', 'COMPLIANCE', 'AUDIT', 'SYSTEM'])
  queryType?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
