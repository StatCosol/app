import { IsOptional, IsString, IsUUID, IsEmail, MinLength } from 'class-validator';

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
}
