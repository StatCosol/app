import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class IssueChallengeDto {
  @ApiPropertyOptional({ description: 'Employee ID hint (optional)' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Extended TTL for offline-sync use' })
  @IsOptional()
  offline?: boolean;
}

export class ConsumeChallengeDto {
  @ApiPropertyOptional()
  @IsString()
  nonce: string;

  @ApiPropertyOptional()
  @IsString()
  challengeType: string;
}
