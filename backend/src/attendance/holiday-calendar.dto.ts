import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
  /** Year to apply (e.g. 2026). */
  year: number;

  /** Month 1-12 to apply. */
  month: number;

  /** Optional branch to limit the apply to. */
  @IsOptional()
  @IsString()
  branchId?: string;
}
