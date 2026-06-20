import { IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DeviceMode {
  KIOSK = 'KIOSK',
  ESS = 'ESS',
}

export class ProvisionDeviceDto {
  @ApiProperty({ enum: DeviceMode })
  @IsEnum(DeviceMode)
  mode: DeviceMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  deviceLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  geofenceLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  geofenceLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(50000)
  geofenceRadiusM?: number;
}
import { Transform } from 'class-transformer';

export class RegisterDeviceDto {
  @ApiProperty({ description: '64-character hex install token provisioned by admin' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/\s+/g, '').trim().toLowerCase()
      : value,
  )
  @IsString()
  @Length(64, 64)
  @Matches(/^[0-9a-fA-F]{64}$/)
  installToken: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  androidId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  deviceName?: string;
}

export class AuthenticateDeviceDto {
  @ApiProperty()
  @IsString()
  installToken: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  androidId?: string;
}

export class RevokeDeviceDto {
  @ApiProperty()
  @IsString()
  deviceId: string;
}
