import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ApprovePayrollRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

export class RejectPayrollRunDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
