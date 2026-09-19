import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsUUID,
  IsInt,
  IsDefined,
} from 'class-validator';

// ── Compliance Items ─────────────────────────────────────
export class CreateComplianceItemDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsString() appliesTo?: string;
}

export class UpdateComplianceItemDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsString() appliesTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Packages ─────────────────────────────────────────────
export class CreatePackageDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() appliesTo?: string;
}

export class UpdatePackageDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() appliesTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Package Items ────────────────────────────────────────
export class AddPackageItemDto {
  @IsUUID() @IsNotEmpty() complianceId: string;
  @IsOptional() @IsBoolean() includedByDefault?: boolean;
}

// ── Rules ────────────────────────────────────────────────
export class CreateRuleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsInt() priority: number;
  @IsUUID() @IsNotEmpty() targetComplianceId: string;
  @IsString() @IsNotEmpty() effect: string;
  // Undecorated, so the global pipe rejected every rule that carried conditions.
  @IsDefined() conditionsJson: any;
}

export class UpdateRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsUUID() targetComplianceId?: string;
  @IsOptional() @IsString() effect?: string;
  @IsOptional() conditionsJson?: any;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Package Rules ────────────────────────────────────────
export class AddPackageRuleDto {
  @IsUUID() @IsNotEmpty() ruleId: string;
}

// ── CCO ──────────────────────────────────────────────────
export class RejectRequestDto {
  @IsOptional() @IsString() remarks?: string;
}
