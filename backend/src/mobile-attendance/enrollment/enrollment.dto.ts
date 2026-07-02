import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SelfEnrollDto {
  @ApiProperty({
    description: 'List of base64-encoded embedding frames (min 7)',
  })
  @IsArray()
  @IsString({ each: true })
  embeddingFrames: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  embeddingModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoB64?: string;

  @ApiProperty()
  @IsBoolean()
  consentGiven: boolean;
}

export class CreateKioskTicketDto {
  @ApiProperty()
  @IsUUID()
  deviceId: string;

  @ApiProperty({ enum: ['EMPLOYEE', 'CONTRACTOR'] })
  @IsEnum(['EMPLOYEE', 'CONTRACTOR'])
  subjectType: 'EMPLOYEE' | 'CONTRACTOR';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractorEmployeeId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  subjectName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subjectCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitKioskTicketDto {
  @ApiProperty({ description: 'Ticket ID' })
  @IsUUID()
  ticketId: string;

  @ApiProperty({ description: 'Averaged embedding frames (base64)' })
  @IsArray()
  @IsString({ each: true })
  embeddingFrames: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  embeddingModel?: string;

  @ApiProperty()
  @IsString()
  livenessNonce: string;

  @ApiProperty()
  @IsString()
  livenessChallengeType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoB64?: string;

  @ApiProperty()
  @IsBoolean()
  consentGiven: boolean;
}

export class DeactivateEnrollmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractorEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
