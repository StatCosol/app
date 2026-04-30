import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(80)
  serialNumber: string;

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
