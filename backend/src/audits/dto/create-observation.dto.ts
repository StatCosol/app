import {
  IsUUID,
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { OmitType } from '@nestjs/swagger';
import { UpdateObservationDto } from './update-observation.dto';

export class CreateObservationDto extends OmitType(UpdateObservationDto, [
  'status',
  'observation',
] as const) {
  declare evidenceFilePaths?: string[];

  @IsUUID()
  auditId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  observation: string;
}

export class ObservationReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  remarks: string;
}
