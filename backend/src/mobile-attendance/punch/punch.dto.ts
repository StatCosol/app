import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordPunchDto {
  @ApiProperty({ description: 'Probe face embedding as base64' })
  @IsString()
  embeddingB64: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  embeddingModel?: string;

  @ApiProperty({ enum: ['IN', 'OUT', 'AUTO'] })
  @IsEnum(['IN', 'OUT', 'AUTO'])
  direction: 'IN' | 'OUT' | 'AUTO';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  livenessNonce?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  livenessChallengeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  livenessScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoB64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  captureLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  captureLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMockLocation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRooted?: boolean;

  @ApiPropertyOptional({
    description: 'True for punches captured offline and synced later',
  })
  @IsOptional()
  @IsBoolean()
  offlineSync?: boolean;

  /** ISO8601 — used for offline-sync punches */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  punchTime?: string;
}
