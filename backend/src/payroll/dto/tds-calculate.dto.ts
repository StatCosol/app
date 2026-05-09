import { IsNotEmpty, IsNumber, IsOptional, IsIn, Min } from 'class-validator';

export class TdsCalculateDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  annualGross: number;

  @IsOptional()
  @IsIn(['OLD', 'NEW'])
  regime?: 'OLD' | 'NEW';

  @IsOptional()
  @IsNumber()
  deduction80C?: number;

  @IsOptional()
  @IsNumber()
  deduction80D?: number;

  @IsOptional()
  @IsNumber()
  deduction24b?: number;

  @IsOptional()
  @IsNumber()
  hraExemption?: number;

  @IsOptional()
  @IsNumber()
  otherDeductions?: number;

  @IsOptional()
  @IsNumber()
  tdsAlreadyPaid?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  remainingMonths?: number;
}
