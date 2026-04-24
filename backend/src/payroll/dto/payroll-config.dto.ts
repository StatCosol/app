import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ComponentOverrideItem {
  @IsString() componentId: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsBoolean() showOnPayslip?: boolean;
  @IsOptional() @IsString() labelOverride?: string;
  @IsOptional() @IsString() formulaOverride?: string;
}

export class SaveComponentOverridesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentOverrideItem)
  items: ComponentOverrideItem[];
}
