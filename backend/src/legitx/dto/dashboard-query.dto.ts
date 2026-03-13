import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Query validation for LegitX dashboard endpoints.
 */
export class DashboardQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @IsOptional()
  @IsIn(['ALL', 'CRITICAL', 'PENDING'])
  toggle?: string;
}
