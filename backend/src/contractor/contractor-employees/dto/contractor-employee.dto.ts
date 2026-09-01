import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateContractorEmployeeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  employeeCode?: string;

  /**
   * User ID the biometric machine allocated at enrolment. This — not
   * employeeCode — is what an eSSL device transmits with each punch, and it is
   * how a punch is attributed to this worker's contractor. Unique per client
   * across employees and contractor workers.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  punchCode?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsDateString()
  dateOfJoining?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  aadhaar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  uan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  esicNumber?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateContractorEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  employeeCode?: string;

  /**
   * User ID the biometric machine allocated at enrolment. This — not
   * employeeCode — is what an eSSL device transmits with each punch, and it is
   * how a punch is attributed to this worker's contractor. Unique per client
   * across employees and contractor workers.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  punchCode?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsDateString()
  dateOfJoining?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  aadhaar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  uan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  esicNumber?: string;
}
