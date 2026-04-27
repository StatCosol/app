import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsArray,
  IsDateString,
  IsUUID,
  IsNumber,
  IsIn,
} from 'class-validator';

// ── Master Data (Department / Grade / Designation) ───────
export class CreateMasterDataItemDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
}

export class UpdateMasterDataItemDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Employee Create / Update ─────────────────────────────
export class CreateEmployeeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() aadhaar?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() branchCode?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designationId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() gradeId?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() fatherName?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() uan?: string;
  @IsOptional() @IsString() esic?: string;
  @IsOptional() @IsString() esiNumber?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() dateOfJoining?: string;
  @IsOptional() @IsNumber() grossSalary?: number;
  @IsOptional() @IsNumber() ctc?: number;
  @IsOptional() @IsNumber() monthlyGross?: number;
  @IsOptional() @IsString() pfApplicableFrom?: string;
  @IsOptional() @IsString() pfServiceStartDate?: string;
  @IsOptional() @IsNumber() basicAtPfStart?: number;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() dateOfExit?: string;
  @IsOptional() @IsString() approvalStatus?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() aadhaar?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designationId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() gradeId?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() fatherName?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() uan?: string;
  @IsOptional() @IsString() esic?: string;
  @IsOptional() @IsString() esiNumber?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() dateOfJoining?: string;
  @IsOptional() @IsNumber() grossSalary?: number;
  @IsOptional() @IsNumber() ctc?: number;
  @IsOptional() @IsNumber() monthlyGross?: number;
  @IsOptional() @IsString() pfApplicableFrom?: string;
  @IsOptional() @IsString() pfServiceStartDate?: string;
  @IsOptional() @IsNumber() basicAtPfStart?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Employee Nomination ──────────────────────────────────
export class CreateEmployeeNominationDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['PF', 'ESI', 'GRATUITY', 'INSURANCE', 'SALARY'])
  nominationType: 'PF' | 'ESI' | 'GRATUITY' | 'INSURANCE' | 'SALARY';
  @IsOptional() @IsString() declarationDate?: string;
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;
  @IsOptional() @IsArray() members?: any[];
}

// ── Salary Revision ──────────────────────────────────────
export class CreateSalaryRevisionDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsUUID() @IsNotEmpty() employeeId: string;
  @IsDateString() effectiveDate: string;
  @IsNumber() previousCtc: number;
  @IsNumber() newCtc: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsUUID() approvedByUserId?: string;
  @IsOptional() componentSnapshot?: any;
}
