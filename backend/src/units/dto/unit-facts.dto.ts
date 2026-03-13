import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UnitFactsDto {
  @IsString()
  stateCode: string;

  @IsEnum(['FACTORY', 'ESTABLISHMENT', 'BOTH'])
  establishmentType: 'FACTORY' | 'ESTABLISHMENT' | 'BOTH';

  @IsBoolean()
  isHazardous: boolean;

  @IsOptional()
  @IsString()
  industryCategory?: string;

  @IsInt()
  @Min(0)
  employeeTotal: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeMale?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeFemale?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  contractWorkersTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  contractorsCount?: number;

  @IsOptional()
  @IsBoolean()
  isBocwProject?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCanteen?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCreche?: boolean;
}
