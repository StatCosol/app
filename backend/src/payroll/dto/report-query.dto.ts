import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class ClientReportQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
}
export class PeriodReportQueryDto extends ClientReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
}
export class BankReportQueryDto extends PeriodReportQueryDto {
  @IsOptional() @IsUUID() runId?: string;
}
export class CostReportQueryDto extends ClientReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
}
export class Form16ReportQueryDto extends ClientReportQueryDto {
  @IsOptional() @Matches(/^(19|20|21)\d{2}-\d{2}$/) financialYear?: string;
}
