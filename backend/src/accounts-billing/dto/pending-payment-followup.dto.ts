import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsDateString,
  Min,
  IsEnum,
} from 'class-validator';
import { PendingPaymentStatus } from '../entities/pending-payment-followup.entity';

export class CreatePendingPaymentFollowupDto {
  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @IsString()
  @IsNotEmpty()
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsOptional()
  @IsEmail()
  ccEmail?: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePendingPaymentFollowupDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsEmail()
  ccEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(PendingPaymentStatus)
  status?: PendingPaymentStatus;
}
