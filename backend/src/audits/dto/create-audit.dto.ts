import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNotEmpty,
} from 'class-validator';
import { AuditType, Frequency } from '../../common/enums';

export class CreateAuditDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  contractorUserId?: string | null;

  @IsEnum(Frequency)
  frequency: Frequency;

  @IsEnum(AuditType)
  auditType: AuditType;

  @IsInt()
  periodYear: number;

  @IsString()
  periodCode: string; // e.g. 2025-01, 2025-Q1, 2025-H1, 2025

  @IsOptional()
  @IsString()
  assignedAuditorId?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
