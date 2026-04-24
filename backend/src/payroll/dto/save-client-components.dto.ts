import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ClientComponentOverrideItemDto {
  @IsUUID()
  componentId: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  showOnPayslip?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelOverride?: string;

  @IsOptional()
  @IsString()
  formulaOverride?: string;
}

export class SaveClientComponentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientComponentOverrideItemDto)
  items: ClientComponentOverrideItemDto[];
}
