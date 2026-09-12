import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  Max,
  Length,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
export const RULE_KEYS = [
  'expiry',
  'task_reminders',
  'filing_overdue',
  'nc_reminders',
  'monthly_filings',
  'monthly_cycles',
  'audit_schedules',
  'applicability',
  'gap_review',
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export class ControlScopeDto {
  @IsIn(RULE_KEYS) ruleKey!: RuleKey;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}
export class ControlOptionsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,80}$/)
  packageId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) registrationDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) documentDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(90) taskDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(90) auditDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(90) escalationDays?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  recipientIds?: string[];
}
export class ControlPreviewDto extends ControlScopeDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ControlOptionsDto)
  options?: ControlOptionsDto;
}
export class ControlSettingsDto extends ControlScopeDto {
  @IsOptional() @IsIn(['DAILY', 'WEEKLY', 'MONTHLY']) frequency?:
    | 'DAILY'
    | 'WEEKLY'
    | 'MONTHLY';
  @IsOptional() @IsInt() @Min(0) @Max(6) weekDay?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) monthDay?: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => ControlOptionsDto)
  options?: ControlOptionsDto;
  @IsBoolean() enabled!: boolean;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) localTime!: string;
  @IsInt() @Min(0) version!: number;
}
export class ControlRunDto {
  @IsUUID() controlId!: string;
  @IsUUID() requestId!: string;
  @IsString() @Length(64, 64) previewDigest!: string;
}
export class ControlRetryDto {
  @IsUUID() requestId!: string;
}
export class ControlHistoryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}

export class ControlInheritDto {
  @IsInt() @Min(1) version!: number;
}
