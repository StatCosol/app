import {
  IsOptional,
  IsString,
  IsUUID,
  IsEmail,
  MinLength,
  IsArray,
  IsIn,
} from 'class-validator';
import {
  PACKAGE_MODULES,
  SERVICE_MODULE_CODES,
  ServiceModuleCode,
} from '../../service-entitlements/service-entitlements.constants';

export class CreateClientDto {
  @IsOptional()
  @IsString()
  clientCode?: string;

  @IsString()
  clientName: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedCrmId?: string;

  @IsOptional()
  @IsUUID()
  assignedAuditorId?: string;

  @IsOptional()
  @IsString()
  registeredAddress?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  primaryContactName?: string;

  @IsOptional()
  @IsString()
  primaryContactEmail?: string;

  @IsOptional()
  @IsString()
  primaryContactMobile?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  // ── Master Client User (created during registration) ──────
  @IsOptional()
  @IsString()
  @MinLength(2)
  masterUserName?: string;

  @IsOptional()
  @IsEmail()
  masterUserEmail?: string;

  @IsOptional()
  @IsString()
  masterUserMobile?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  masterUserPassword?: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.keys(PACKAGE_MODULES))
  servicePackageCode?: string;

  @IsOptional()
  @IsArray()
  @IsIn(SERVICE_MODULE_CODES, { each: true })
  serviceModules?: ServiceModuleCode[];

  @IsOptional()
  @IsString()
  servicePackageNote?: string;
}
