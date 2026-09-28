import {
  IsString,
  IsOptional,
  IsEmail,
  IsUUID,
  IsIn,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
  Equals,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;
  @IsEmail()
  toEmail: string;

  @IsOptional()
  @IsString()
  ccEmail?: string;

  /** Comma-separated, like ccEmail. Not @IsEmail — a list is not one address. */
  @IsOptional()
  @IsString()
  bccEmail?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

export class ResolveInvoiceDeliveryDto {
  @Equals(true)
  providerVerified: boolean;
  @IsIn(['SENT', 'NOT_SENT'])
  outcome: 'SENT' | 'NOT_SENT';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  note: string;
}

export class InvoiceEmailLogsQuery {
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class InvoiceFileInventoryQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36500)
  minAgeDays = 365;
}
