import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  MaxLength,
  IsUUID,
  IsInt,
  Min,
  Max,
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

/**
 * Body for the ADMIN employee-code backfill.
 *
 * A class, not an inline `{ clientId?: string }` type: an inline type erases to
 * `Object` in the emitted metadata, so the global ValidationPipe skips it
 * entirely. Unvalidated, `{"clientId": 123}` reached `.trim()` and threw a
 * TypeError — a 500 where the caller should have been told 400 — and a
 * non-numeric `limit` reached `Math.min(Math.max(limit,1),1000)` as NaN and was
 * handed to a query.
 */
export class BackfillCodesDto {
  /** Target client. A platform admin has no client context of its own. */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** Upper bound is the service's own cap, so a larger value is a typo. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
