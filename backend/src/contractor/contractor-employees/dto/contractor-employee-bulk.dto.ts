import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * One spreadsheet row.
 *
 * This is NOT wired to the global ValidationPipe, deliberately — see the note
 * on `rows` in BulkCreateContractorEmployeesDto. The service validates each row
 * against this class itself and reports failures per row, so one bad cell fails
 * one line of the upload instead of the whole file.
 *
 * Until now nothing validated these rows at all: the endpoint took
 * `@Body() body: { branchId?: string; rows: any[] }`, and a plain TypeScript
 * type erases to `Object` in the emitted metadata, so class-validator never
 * inspected it. `bulkCreate()` then spread each row straight into
 * `prepare()` and on into the entity, so a row could set any column except the
 * four `prepare()` strips (clientId, branchId, contractorUserId, id) —
 * including `status`, `dateOfExit` and `exitReason`. Those three are absent
 * from this class on purpose: a bulk import creates active workers, and an exit
 * is an operation with its own endpoint.
 */
export class BulkContractorEmployeeRowDto {
  @IsString()
  @MaxLength(100)
  name: string;

  /**
   * Left loose on purpose. `normalizeSkill()` accepts "semi skilled" and
   * "Semi-Skilled" and uppercases them, which is the kind of thing a
   * spreadsheet actually contains; the service then rejects the row by name if
   * the result is not one of the four statutory grades. Pinning @IsIn here
   * would reject those spellings before that normalisation ever ran.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  skillCategory?: string;

  /*
   * @Type coerces before validating, so a cell that arrives as the string
   * "15000" still passes. What it no longer does is pass silently when the cell
   * is unparseable: `toNumberOrNull()` turned "n/a" into null, the worker was
   * created with no salary, and `validateSalary()` returns early on a null
   * salary — so a typo in this column quietly skipped the statutory
   * minimum-wage check. Now the row fails and says which column.
   *
   * The bounds are the numeric column widths: 12,2 and 10,2.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9999999999.99)
  monthlySalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  dailyWage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  /*
   * Dates stay strings here rather than @IsDateString.
   *
   * A real Excel date cell reaches the browser as a Date, and the uploader
   * stringifies it — "Sat May 12 1990 00:00:00 GMT+0530 (India Standard Time)",
   * not an ISO date. Rejecting that here would fail uploads that work today.
   * The parsing is the actual fix and it is not this change.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  dateOfJoining?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(30)
  esic?: string;

  @IsOptional()
  @IsBoolean()
  pfApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  esiApplicable?: boolean;

  /** Drives the minimum-wage lookup, so a wrong length here is worth catching. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  stateCode?: string;

  /**
   * A supplied code wins over the generated one, so it has to survive the
   * whitelist — dropping it would silently renumber every row of an import
   * that carries existing codes.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  punchCode?: string;

  /** Per-row override of the upload's branch; the controller access-checks each distinct value. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * The bulk upload envelope.
 *
 * A class rather than an inline type, so the global pipe actually runs. It was
 * inline, which is why `branchId` reached `assertBranchAccess()` as whatever
 * the caller sent and why an arbitrarily long `rows` array was walked — and
 * access-checked, one query per distinct branch — before `bulkCreate()`'s
 * 1000-row cap ever looked at it.
 */
export class BulkCreateContractorEmployeesDto {
  /** Default branch for rows that do not carry their own. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /**
   * Validated per row by the service, not here.
   *
   * @ValidateNested would hand the whole upload to the global pipe, and one
   * malformed cell in row 400 would come back as a flat 400 for the entire
   * file. This endpoint reports per-row results and imports the rows that pass,
   * which is the behaviour the upload screen is built around — so the rows
   * arrive as plain objects and `bulkCreate()` validates each one against
   * BulkContractorEmployeeRowDto, folding failures into those results.
   *
   * The cap matches the service's own limit; it is repeated here so an
   * oversized body is rejected before any of that work happens.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsObject({ each: true })
  rows: Record<string, unknown>[];
}
