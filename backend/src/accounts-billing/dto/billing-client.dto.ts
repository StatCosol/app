import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';
import { BillingFrequency } from '../enums';

export class CreateBillingClientDto {
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsEmail()
  billingEmail: string;

  @IsOptional()
  @IsString()
  ccEmail?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsBoolean()
  gstApplicable?: boolean;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @IsString()
  @IsNotEmpty()
  stateName: string;

  @IsString()
  @IsNotEmpty()
  stateCode: string;

  @IsOptional()
  @IsNumber()
  defaultGstRate?: number;

  @IsOptional()
  @IsString()
  defaultSacCode?: string;

  @IsOptional()
  @IsNumber()
  paymentTermsDays?: number;

  @IsOptional()
  @IsEnum(BillingFrequency)
  billingFrequency?: BillingFrequency;

  @IsString()
  @IsNotEmpty()
  billingAddress: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}

export class UpdateBillingClientDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  ccEmail?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsBoolean()
  gstApplicable?: boolean;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @IsOptional()
  @IsString()
  stateName?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @IsNumber()
  defaultGstRate?: number;

  @IsOptional()
  @IsString()
  defaultSacCode?: string;

  @IsOptional()
  @IsNumber()
  paymentTermsDays?: number;

  @IsOptional()
  @IsEnum(BillingFrequency)
  billingFrequency?: BillingFrequency;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
