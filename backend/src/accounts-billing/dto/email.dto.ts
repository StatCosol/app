import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';

export class SendInvoiceEmailDto {
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
