import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHolidayDto {
  @IsDateString()
  holidayDate: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  stateCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}

export class ApplyHolidaysDto {
  /*
   * Neither field had a decorator, so the global pipe (forbidNonWhitelisted)
   * rejected both — and the handler requires both. "Apply holidays to
   * attendance" has answered 400 since it shipped (#481), which is also what
   * holiday-work double wage depends on.
   */
  /** Year to apply (e.g. 2026). */
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  /** Month 1-12 to apply. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  /** Optional branch to limit the apply to. */
  @IsOptional()
  @IsString()
  branchId?: string;
}
