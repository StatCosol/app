import {
  IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsNotEmpty,
} from 'class-validator';
import { PaymentMode } from '../enums';

export class RecordPaymentDto {
  @IsDateString()
  paymentDate: string;

  @IsNumber()
  amountReceived: number;

  @IsOptional() @IsNumber()
  tdsAmount?: number;

  @IsOptional() @IsNumber()
  otherDeduction?: number;

  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @IsOptional() @IsString()
  referenceNumber?: string;

  @IsOptional() @IsString()
  bankName?: string;

  @IsOptional() @IsString()
  remarks?: string;
}
