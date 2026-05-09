import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum SupportedAuditType {
  CONTRACTOR_AUDIT = 'CONTRACTOR_AUDIT',
  FACTORY_AUDIT = 'FACTORY_AUDIT',
  BRANCH_COMPLIANCE_AUDIT = 'BRANCH_COMPLIANCE_AUDIT',
  SAFETY_AUDIT = 'SAFETY_AUDIT',
  PAYROLL_AUDIT = 'PAYROLL_AUDIT',
  CLIENT_LEVEL_AUDIT = 'CLIENT_LEVEL_AUDIT',
}

export class CreateManualAuditScheduleDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;

  @ApiProperty({ enum: SupportedAuditType })
  @IsEnum(SupportedAuditType)
  auditType!: SupportedAuditType;

  @ApiProperty()
  @IsUUID()
  auditorId!: string;

  @ApiProperty()
  @IsDateString()
  scheduleDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
