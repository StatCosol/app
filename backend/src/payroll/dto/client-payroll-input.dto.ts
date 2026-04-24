import {
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class ClientCreatePayrollInputDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsInt()
  @Min(2020)
  @Max(2099)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ClientUploadPayrollInputFileDto {
  @IsOptional()
  @IsString()
  docType?: string;
}

export class ClientUploadRegisterRecordDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  payrollInputId?: string;

  @IsOptional()
  @IsInt()
  periodYear?: number;

  @IsOptional()
  @IsInt()
  periodMonth?: number;
}

export class ClientUpdatePayrollSettingsDto {
  @IsOptional()
  allowBranchPayrollAccess?: boolean;

  @IsOptional()
  allowBranchWageRegisters?: boolean;

  @IsOptional()
  allowBranchSalaryRegisters?: boolean;
}
