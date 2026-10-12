import { IsInt, Min, Max } from 'class-validator';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBranchRegistrationDto {
  @IsNotEmpty()
  @IsString()
  branchId: string;

  @IsNotEmpty()
  @IsString()
  type: string; // e.g., Factory License, PF Code, ESI Code, PT, CLRA License

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
