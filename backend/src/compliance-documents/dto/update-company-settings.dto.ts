import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsBoolean()
  allowBranchWageRegisters?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBranchSalaryRegisters?: boolean;
}
