import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEmail,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @IsString()
  @IsOptional()
  branchType?: string;

  @IsString()
  @IsOptional()
  stateCode?: string;

  @IsString()
  @IsOptional()
  @IsIn(['FACTORY', 'SHOP', 'BRANCH', 'HO', 'WAREHOUSE', 'OTHER'])
  establishmentType?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  headcount?: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  employeeCount?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  contractorCount?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  branchUserName?: string;

  @IsEmail()
  @IsOptional()
  branchUserEmail?: string;

  @IsString()
  @IsOptional()
  branchUserMobile?: string;

  @IsString()
  @IsOptional()
  branchUserPassword?: string;
}
