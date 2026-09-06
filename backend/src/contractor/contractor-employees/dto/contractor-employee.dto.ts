import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  IsBoolean,
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

  /**
   * `esic`, not `esicNumber`.
   *
   * The service takes Partial<ContractorEmployeeEntity> and maps property names
   * straight onto the column, so `esicNumber` matched nothing and was dropped
   * by the whitelist — silently, because it was optional.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  esic?: string;

  /*
   * Everything below was sent by the registration form and not declared here.
   *
   * The global pipe runs whitelist + forbidNonWhitelisted, so a single unknown
   * property is a flat 400 with no clue in the network tab. That is why single
   * registration failed while bulk import worked: the bulk endpoint takes
   * `@Body() body: { rows: any[] }` — a plain type, not a DTO class — so
   * class-validator never inspects it and it accepts anything.
   *
   * Column lengths mirror the entity exactly (gender 10, father_name 200,
   * department 120, esic 30) rather than being guessed, so validation fails
   * before Postgres does and with a message that names the field.
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsBoolean()
  pfApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  esiApplicable?: boolean;

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

  /* Same set as the create DTO, and for the same reason: the edit form posts
   * these too, so leaving them undeclared makes editing a worker fail exactly
   * as creating one did. `esicNumber` was the wrong name here as well. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  esic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsBoolean()
  pfApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  esiApplicable?: boolean;

  @IsOptional()
  @IsUUID()
  branchId?: string;
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
