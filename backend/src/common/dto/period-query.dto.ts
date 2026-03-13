import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query-string DTO for month-scoped endpoints.
 * Format: YYYY-MM  (e.g. "2025-06")
 */
export class MonthQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;
}

/**
 * Query-string DTO for financial-year-scoped endpoints.
 * Format: YYYY-YY  (e.g. "2025-26")
 */
export class FyQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fy must be YYYY-YY' })
  fy?: string;
}
