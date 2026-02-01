import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsUUID,
  IsBooleanString,
} from 'class-validator';

export class UserDirectoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1) page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1) @Max(200) limit?: number;

  // Query param comes as string: "true"/"false"
  @IsOptional()
  @IsString()
  @IsBooleanString() groupByClient?: string; // "true" | "false"

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  roleCode?: string;

  @IsOptional()
  @IsIn(['all', 'ACTIVE', 'INACTIVE'])
  status?: 'all' | 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsUUID() clientId?: string;

  @IsOptional()
  @IsUUID() branchId?: string;
}
