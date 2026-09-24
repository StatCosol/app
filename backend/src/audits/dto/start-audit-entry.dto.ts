import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { AuditType } from '../../common/enums';

export class StartAuditEntryDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  branchId!: string;

  @IsEnum(AuditType)
  auditType!: AuditType;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodCode!: string;

  @IsOptional()
  @IsUUID()
  contractorUserId?: string;
}
