import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * Query validation for LegitX compliance endpoints (MCD, returns, audits).
 */
export class ComplianceQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lawType?: string;

  @IsOptional()
  @IsIn(['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE', 'FILED', 'DUE_SOON', 'COMPLETED', 'IN_PROGRESS', 'PLANNED'])
  status?: string;
}
