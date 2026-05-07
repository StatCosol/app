import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import {
  CLIENT_CONTACT_DEPARTMENTS,
  ClientContactDepartment,
} from './client-department-contact.entity';

export class CreateClientContactDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty({ enum: CLIENT_CONTACT_DEPARTMENTS })
  @IsEnum(CLIENT_CONTACT_DEPARTMENTS as unknown as Record<string, string>)
  department: ClientContactDepartment;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  name: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClientContactDto extends PartialType(
  CreateClientContactDto,
) {}
