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
} from 'class-validator';
import { Type } from 'class-transformer';
export const RULE_KEYS = [
  'expiry',
  'task_reminders',
  'filing_overdue',
  'nc_reminders',
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export class ControlScopeDto {
  @IsIn(RULE_KEYS) ruleKey!: RuleKey;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}
export class ControlSettingsDto extends ControlScopeDto {
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
