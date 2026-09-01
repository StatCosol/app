import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RegisterBiometricDeviceDto {
  @IsString()
  @MaxLength(80)
  serialNumber: string;

  /**
   * Optional: pin this machine to a single contractor. Leave unset for a
   * shared machine — the punched code decides who a punch belongs to.
   */
  @IsOptional()
  @IsUUID()
  contractorUserId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateDeviceDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}
