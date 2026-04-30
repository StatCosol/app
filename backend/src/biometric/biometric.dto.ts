import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class IngestPunchItemDto {
  @ApiProperty({ description: 'Employee code as registered in the device' })
  @IsString()
  employeeCode: string;

  @ApiProperty({ description: 'Punch timestamp (ISO-8601)' })
  @IsISO8601()
  punchTime: string;

  @ApiPropertyOptional({ enum: ['IN', 'OUT', 'AUTO'] })
  @IsOptional()
  @IsIn(['IN', 'OUT', 'AUTO'])
  direction?: 'IN' | 'OUT' | 'AUTO';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class IngestPunchesDto {
  @ApiProperty({ type: [IngestPunchItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngestPunchItemDto)
  punches: IngestPunchItemDto[];

  @ApiPropertyOptional({
    description:
      'If true, attendance_records will be (re)built for each affected (employee,date). Defaults to true.',
  })
  @IsOptional()
  autoProcess?: boolean;
}

export class ProcessPunchesDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD) — start of range, inclusive' })
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'Date (YYYY-MM-DD) — end of range, inclusive' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({
    description: 'If true, also reprocess punches already marked processed.',
  })
  @IsOptional()
  reprocess?: boolean;
}
