import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class AdminReassignDto {
  @IsIn(['CRM', 'AUDITOR'])
  assignmentType: 'CRM' | 'AUDITOR';

  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  oldUserId?: string;

  @IsUUID()
  newUserId: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsBoolean()
  notifyParties?: boolean;
}
