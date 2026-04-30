import { IsString, IsOptional, IsNumber, IsEmail } from 'class-validator';

export class UpdateBillingSettingsDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @IsString()
  stateName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  ifscCode?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @IsOptional()
  @IsString()
  proformaPrefix?: string;

  @IsOptional()
  @IsString()
  creditNotePrefix?: string;

  @IsOptional()
  @IsNumber()
  defaultGstRate?: number;

  @IsOptional()
  @IsNumber()
  defaultPaymentTermsDays?: number;

  @IsOptional()
  @IsString()
  defaultSacCode?: string;

  @IsOptional()
  @IsString()
  authorizedSignatoryName?: string;

  @IsOptional()
  @IsString()
  authorizedSignatoryDesignation?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsString()
  notesFooter?: string;
}
