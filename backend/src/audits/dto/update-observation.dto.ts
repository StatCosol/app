import {
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  IsIn,
  MaxLength,
  ArrayMaxSize,
  Matches,
} from 'class-validator';

export class UpdateObservationDto {
  @IsString()
  @MaxLength(20000)
  @IsOptional()
  observation?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  consequences?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  complianceRequirements?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  elaboration?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  clause?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  recommendation?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  risk?: string;

  @IsString()
  @MaxLength(20000)
  @IsOptional()
  @IsIn(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'])
  status?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @MaxLength(2048, { each: true })
  @Matches(/^(?!.*(?:\.\.|[\\\r\n])).+$/, { each: true })
  @IsString({ each: true })
  @IsOptional()
  evidenceFilePaths?: string[];
}
