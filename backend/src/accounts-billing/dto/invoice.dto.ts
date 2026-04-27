import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceType } from '../enums';

export class CreateInvoiceItemDto {
  @IsOptional()
  @IsString()
  serviceCode?: string;

  @IsString()
  @IsNotEmpty()
  serviceDescription: string;

  @IsOptional()
  @IsString()
  sacCode?: string;

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  rate: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  gstRate?: number;

  @IsOptional()
  @IsBoolean()
  isReimbursement?: boolean;

  @IsOptional()
  @IsNumber()
  sequence?: number;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  billingClientId: string;

  @IsEnum(InvoiceType)
  invoiceType: InvoiceType;

  @IsDateString()
  invoiceDate: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}
