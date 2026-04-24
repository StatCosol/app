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
}
