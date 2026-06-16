import { IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Install token provisioned by admin' })
  @IsString()
  @Length(1, 64)
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
