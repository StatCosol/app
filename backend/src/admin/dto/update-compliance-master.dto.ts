import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { Frequency } from '../../common/enums';

export class UpdateComplianceMasterDto {
  @IsString()
  @IsOptional()
  complianceName?: string;

  @IsString()
  @IsOptional()
  lawName?: string;

  @IsString()
  @IsOptional()
  lawFamily?: string;

  @IsString()
  @IsOptional()
  stateScope?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minHeadcount?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxHeadcount?: number;

  @IsEnum(Frequency)
  @IsOptional()
  frequency?: Frequency;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
