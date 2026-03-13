import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EstablishmentType, PlantType, UnitType } from '../entities/enums';

export class CreateUnitDto {
  @IsUUID()
  tenantId: string;

  @IsEnum(UnitType)
  unitType: UnitType;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  state?: string | null;

  @IsOptional()
  @IsEnum(EstablishmentType)
  establishmentType?: EstablishmentType;

  @IsOptional()
  @IsEnum(PlantType)
  plantType?: PlantType;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;
}
