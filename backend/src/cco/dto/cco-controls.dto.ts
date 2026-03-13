import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
} from 'class-validator';

export class SaveSlaRuleDto {
  @IsOptional() @IsString() id?: string;
  @IsString() scope: string;
  @IsString() priority: string;
  @IsInt() @Min(1) targetHours: number;
  @IsInt() @Min(1) escalationLevel1Hours: number;
  @IsInt() @Min(1) escalationLevel2Hours: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SaveEscalationThresholdDto {
  @IsOptional() @IsString() id?: string;
  @IsString() type: string;
  @IsInt() @Min(1) value: number;
  @IsInt() @Min(1) windowDays: number;
  @IsString() severity: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SaveReminderRuleDto {
  @IsOptional() @IsString() id?: string;
  @IsString() scope: string;
  @IsInt() @Min(1) daysBeforeDue: number;
  @IsArray() @IsString({ each: true }) notifyRoles: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ToggleActiveDto {
  @IsBoolean() isActive: boolean;
}
