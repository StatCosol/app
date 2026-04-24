import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

export class UpdateObservationDto {
  @IsString()
  @IsOptional()
  observation?: string;

  @IsString()
  @IsOptional()
  consequences?: string;

  @IsString()
  @IsOptional()
  complianceRequirements?: string;

  @IsString()
  @IsOptional()
  elaboration?: string;

  @IsString()
  @IsOptional()
  clause?: string;

  @IsString()
  @IsOptional()
  recommendation?: string;

  @IsString()
  @IsOptional()
  risk?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidenceFilePaths?: string[];
}
