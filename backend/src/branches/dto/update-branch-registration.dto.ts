import { IsInt, Min, Max } from 'class-validator';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateBranchRegistrationDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  authority?: string;

  @IsOptional()
  @IsDateString()
  issuedDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  licensedWorkerLimit?: number | null;
}
