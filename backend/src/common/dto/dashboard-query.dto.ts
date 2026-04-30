import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardBaseQueryDto {
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

export class DashboardWindowQueryDto extends DashboardBaseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  windowDays?: number;
}

export class DashboardSearchQueryDto extends DashboardBaseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class DashboardStatusQueryDto extends DashboardBaseQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class DashboardMonthsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(24)
  months?: number;
}

export class DashboardRankingsQueryDto {
  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}

export class DashboardTabQueryDto extends DashboardWindowQueryDto {
  @IsString()
  tab: string;
}

export class DashboardBranchQueryDto extends DashboardBaseQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class DashboardLimitQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class DashboardDaysQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
