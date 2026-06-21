import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  PACKAGE_MODULES,
  SERVICE_MODULE_CODES,
  ServiceModuleCode,
} from '../service-entitlements.constants';

export class CreateModuleChangeRequestDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @IsIn(Object.keys(PACKAGE_MODULES))
  packageCode!: string;

  @IsOptional()
  @IsArray()
  @IsIn(SERVICE_MODULE_CODES, { each: true })
  modules?: ServiceModuleCode[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReviewModuleChangeRequestDto {
  @IsString()
  @IsIn(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'])
  action!: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

  @IsOptional()
  @IsString()
  note?: string;
}
