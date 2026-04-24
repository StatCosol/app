import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { Frequency } from '../../common/enums';

export class CreateComplianceMasterDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  complianceName: string;

  @IsString()
  @IsNotEmpty()
  lawName: string;

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
  @IsNotEmpty()
  frequency: Frequency;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
