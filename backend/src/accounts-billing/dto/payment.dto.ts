import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  Min,
  IsPositive,
} from 'class-validator';
import { PaymentMode } from '../enums';

export class RecordPaymentDto {
  @IsDateString()
  paymentDate: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountReceived: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tdsAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherDeduction?: number;

  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
