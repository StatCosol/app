import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum AuditTab {
  ACTIVE = 'ACTIVE',
  OVERDUE = 'OVERDUE',
  DUE_SOON = 'DUE_SOON',
  COMPLETED = 'COMPLETED',
}

export enum ObservationStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum ObservationRisk {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum ReportStatus {
  PENDING_SUBMISSION = 'PENDING_SUBMISSION',
  SUBMITTED = 'SUBMITTED',
}

export class AuditorSummaryQueryDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  windowDays?: number;
}

export class AuditorAuditsQueryDto {
  @IsEnum(AuditTab)
  tab: AuditTab;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  windowDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AuditorObservationsQueryDto {
  @IsOptional()
  @IsEnum(ObservationStatus)
  status?: ObservationStatus;

  @IsOptional()
  @IsEnum(ObservationRisk)
  risk?: ObservationRisk;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AuditorReportsQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class UpdateEvidenceStatusDto {
  @IsString()
  status: string;
}
