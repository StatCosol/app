import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreatePayrollRunDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsInt()
  @Min(2020)
  @Max(2099)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  sourcePayrollInputId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
