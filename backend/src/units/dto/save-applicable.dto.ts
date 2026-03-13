import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OverrideItem {
  @IsUUID()
  complianceId: string;

  @IsBoolean()
  isApplicable: boolean;

  @IsString()
  @MinLength(5)
  reason: string;
}

export class SaveApplicableDto {
  @IsString()
  packageId: string; // accepts UUID or package code (e.g. 'DEFAULT_INDIA')

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedSpecialActCodes?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverrideItem)
  overrides?: OverrideItem[];
}
