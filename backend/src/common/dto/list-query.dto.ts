import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Standard query-string DTO accepted by every paginated list endpoint.
 * Maps 1-to-1 with the frontend SmartDataTable's page/sort/search contract.
 */
export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 25;

  /** Free-text search (mapped to ILIKE on whitelisted columns) */
  @IsOptional()
  @IsString()
  q?: string;

  /** Column key to sort by (validated against an allow-list per endpoint) */
  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order?: 'ASC' | 'DESC' | 'asc' | 'desc';
}
