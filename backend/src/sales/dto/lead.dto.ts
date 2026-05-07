import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LeadActivityOutcome,
  LeadActivityType,
  LeadPriority,
  LeadSource,
  LeadStage,
} from '../enums/lead.enums';

export class CreateLeadDto {
  @IsString()
  @Length(1, 200)
  companyName: string;

  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) designation?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;

  @IsOptional() @IsInt() @Min(0) employeeCount?: number;

  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() @MaxLength(200) sourceDetail?: string;

  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsEnum(LeadPriority) priority?: LeadPriority;

  @IsOptional() @IsNumber() estimatedValue?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
  @IsOptional() @IsDateString() nextFollowupAt?: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsUUID() ownerUserId?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @Length(1, 200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) designation?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsInt() @Min(0) employeeCount?: number;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() @MaxLength(200) sourceDetail?: string;
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsEnum(LeadPriority) priority?: LeadPriority;
  @IsOptional() @IsNumber() estimatedValue?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
  @IsOptional() @IsDateString() nextFollowupAt?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(200) lostReason?: string;
  @IsOptional() @IsBoolean() isArchived?: boolean;
}

export class CreateLeadActivityDto {
  @IsEnum(LeadActivityType)
  activityType: LeadActivityType;

  @IsOptional() @IsEnum(LeadActivityOutcome) outcome?: LeadActivityOutcome;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsDateString() nextFollowupAt?: string;
  @IsOptional() @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() @MaxLength(500) attachmentUrl?: string;
}

export class ListLeadsQueryDto {
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsEnum(LeadPriority) priority?: LeadPriority;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() bucket?:
    | 'open'
    | 'won'
    | 'lost'
    | 'archived'
    | 'all';
  @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}
