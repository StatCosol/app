import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  IsBoolean,
  IsNumber,
  IsIn,
  MaxLength,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  SKILL_CATEGORIES,
  SkillCategory,
} from '../entities/contractor-employee.entity';

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

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{12}$/, {
    message: 'Aadhaar is required and must contain 12 digits',
  })
  aadhaar: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'PAN is required and must use the format ABCDE1234F',
  })
  pan: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^[0-9]{1,40}$/, {
    message:
      'Bank account number is required and must contain only digits (maximum 40)',
  })
  bankAccount: string;

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

  /*
   * The wage trio, sent by the form on every save exactly as the fields above
   * are, and undeclared until now — so on their own they kept the 400 alive
   * after the rest of this DTO was fixed.
   *
   * They are not cosmetic. create() passes skillCategory and monthlySalary to
   * minWage.validateSalary(), the statutory minimum-wage gate; accepting them
   * under `whitelist: true` without declaring them would have stripped them and
   * run that gate against nulls, which passes everything.
   *
   * @IsIn uses the entity's own SKILL_CATEGORIES rather than leaning on the
   * service's normalizeSkill(), which maps an unrecognised grade to null —
   * again a silent pass through the wage gate.
   *
   * The @Max bounds are the numeric column widths (12,2 and 10,2), so an
   * overflow is a 400 naming the field instead of a Postgres 500.
   */
  @IsOptional()
  @IsIn(SKILL_CATEGORIES)
  skillCategory?: SkillCategory;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999999999.99)
  monthlySalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  dailyWage?: number;

  /**
   * Placement, and create-only: the controller reads it, access-checks it with
   * assertBranchAccess() and passes it to the service as an explicit argument.
   * It is deliberately absent from the update DTO — see the note there.
   */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateContractorEmployeeDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^[0-9]{1,40}$/, {
    message: 'Bank account number must contain only digits (maximum 40)',
  })
  bankAccount?: string;

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
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{12}$/, { message: 'Aadhaar must contain 12 digits' })
  aadhaar?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'PAN must use the format ABCDE1234F',
  })
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

  /*
   * The wage trio, sent by the form on every save exactly as the fields above
   * are, and undeclared until now — so on their own they kept the 400 alive
   * after the rest of this DTO was fixed.
   *
   * They are not cosmetic. create() passes skillCategory and monthlySalary to
   * minWage.validateSalary(), the statutory minimum-wage gate; accepting them
   * under `whitelist: true` without declaring them would have stripped them and
   * run that gate against nulls, which passes everything.
   *
   * @IsIn uses the entity's own SKILL_CATEGORIES rather than leaning on the
   * service's normalizeSkill(), which maps an unrecognised grade to null —
   * again a silent pass through the wage gate.
   *
   * The @Max bounds are the numeric column widths (12,2 and 10,2), so an
   * overflow is a 400 naming the field instead of a Postgres 500.
   */
  @IsOptional()
  @IsIn(SKILL_CATEGORIES)
  skillCategory?: SkillCategory;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999999999.99)
  monthlySalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  dailyWage?: number;

  /*
   * No branchId here, deliberately.
   *
   * ContractorEmployeesService.prepare() deletes clientId, branchId,
   * contractorUserId and id before the body reaches the entity, so that no
   * request body can move a worker across a tenant, branch or contractor
   * boundary. Declaring branchId here would therefore accept the property and
   * silently drop it: the edit screen would report a branch change that never
   * happened. Rejecting it is the honest answer, and the form now sends it only
   * on create.
   *
   * Moving a worker to another branch is a real operation, but it is a transfer
   * with its own access check — not a field on the profile form.
   */
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
