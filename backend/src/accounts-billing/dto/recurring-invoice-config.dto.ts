import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { BillingFrequency } from '../enums';

export class CreateRecurringInvoiceConfigDto {
  @IsUUID()
  billingClientId: string;

  @IsString()
  @IsNotEmpty()
  invoiceName: string;

  @IsEnum(BillingFrequency)
  frequency: BillingFrequency;

  @IsString()
  @IsNotEmpty()
  serviceDescription: string;

  @IsNumber()
  @Min(0)
  defaultAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultGstRate?: number;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsDateString()
  nextRunDate: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRecurringInvoiceConfigDto {
  @IsOptional()
  @IsUUID()
  billingClientId?: string;

  @IsOptional()
  @IsString()
  invoiceName?: string;

  @IsOptional()
  @IsEnum(BillingFrequency)
  frequency?: BillingFrequency;

  @IsOptional()
  @IsString()
  serviceDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultGstRate?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  nextRunDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
