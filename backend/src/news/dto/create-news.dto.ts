import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsIn,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const NEWS_CATEGORIES = [
  'GENERAL',
  'COMPLIANCE',
  'HR',
  'PAYROLL',
  'ANNOUNCEMENT',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export class CreateNewsDto {
  @ApiProperty({ example: 'Monthly compliance update' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'Full news body text...' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ enum: NEWS_CATEGORIES, default: 'GENERAL' })
  @IsOptional()
  @IsString()
  @IsIn(NEWS_CATEGORIES)
  category?: NewsCategory;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ example: '2026-04-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: '/uploads/news/image.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
