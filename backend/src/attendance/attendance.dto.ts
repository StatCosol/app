import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  IsInt,
  ArrayNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceEntity } from './entities/attendance.entity';

const ATTENDANCE_STATUSES: AttendanceEntity['status'][] = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'ON_LEAVE',
  'HOLIDAY',
  'WEEK_OFF',
];

type AttendanceStatus = AttendanceEntity['status'];

export class MarkAttendanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: '2026-03-21' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: 'PRESENT' })
  @IsIn(ATTENDANCE_STATUSES)
  status: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkOut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  workedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  overtimeHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkAttendanceEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: 'PRESENT' })
  @IsIn(ATTENDANCE_STATUSES)
  status: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkOut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  workedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  overtimeHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkMarkAttendanceDto {
  @ApiProperty({ example: '2026-03-21' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ type: [BulkAttendanceEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceEntryDto)
  entries: BulkAttendanceEntryDto[];
}

export class SeedDefaultsDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    example: [0],
    description: 'Weekly off day numbers (0=Sun, 6=Sat)',
  })
  @IsOptional()
  @IsArray()
  weeklyOffDays?: number[];
}

export class EditAttendanceDto {
  @ApiProperty({ example: 'PRESENT' })
  @IsIn(ATTENDANCE_STATUSES)
  status: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkOut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  workedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  overtimeHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ApproveAttendanceDto {
  @ApiProperty({ description: 'Array of attendance record IDs to approve' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}

export class RejectAttendanceDto {
  @ApiProperty({ description: 'Array of attendance record IDs to reject' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
