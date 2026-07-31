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
  Min,
  Max,
  IsPositive,
  MaxLength,
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

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  gstRate?: number;

  @IsOptional()
  @IsBoolean()
  isReimbursement?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  purchaseOrderNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  billingClientId?: string;

  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  purchaseOrderNumber?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];
}

export class ConvertProformaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  purchaseOrderNumber: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
