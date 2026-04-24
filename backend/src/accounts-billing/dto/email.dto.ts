import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';

export class SendInvoiceEmailDto {
  @IsEmail()
  toEmail: string;

  @IsOptional() @IsString()
  ccEmail?: string;

  @IsOptional() @IsString()
  subject?: string;

  @IsOptional() @IsString()
  body?: string;
}
