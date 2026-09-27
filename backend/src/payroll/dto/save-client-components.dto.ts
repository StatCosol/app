import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ArrayMaxSize,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ClientComponentOverrideItemDto {
  @IsUUID()
  componentId: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number | null;

  @IsOptional()
  @IsBoolean()
  showOnPayslip?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelOverride?: string | null;

  @IsOptional()
  @IsString()
  formulaOverride?: string | null;
}

export class SaveClientComponentsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ClientComponentOverrideItemDto)
  items: ClientComponentOverrideItemDto[];
}
