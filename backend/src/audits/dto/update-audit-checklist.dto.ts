import {
  IsBoolean,
  IsIn,
  ValidateIf,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateAuditChecklistDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['PENDING', 'UPLOADED', 'COMPLIED', 'NON_COMPLIED', 'NOT_APPLICABLE'])
  status?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  remarks?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  automationReviewed?: boolean;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  linkedDocId?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['contractor_documents', 'branch_documents'])
  linkedDocTable?: string;
}
