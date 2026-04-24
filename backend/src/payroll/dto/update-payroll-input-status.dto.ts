import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PayrollInputStatus } from '../constants/payroll-input-status';

export class UpdatePayrollInputStatusDto {
  @IsEnum(PayrollInputStatus)
  status: PayrollInputStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
