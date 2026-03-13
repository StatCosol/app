import { IsOptional, IsString, Matches } from 'class-validator';
import { ListQueryDto } from './list-query.dto';

/**
 * ListQueryDto + common scope / period / status filters.
 * Use this for any list endpoint that supports client + branch + month + status filtering.
 */
export class ScopedListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @IsOptional()
  @IsString()
  fy?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  tab?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  entityType?: string;
}
