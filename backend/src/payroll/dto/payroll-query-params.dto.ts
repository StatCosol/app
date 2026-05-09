import { IsOptional, IsString, IsNumberString, IsUUID } from 'class-validator';

/** GET /payroll/summary, GET /payroll/dashboard — currently unused but kept for forward compat */
export class PayrollSummaryQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
}

/** GET /payroll/employees */
export class PayrollEmployeesQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() pfStatus?: string;
  @IsOptional() @IsString() esiStatus?: string;
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}

/** GET /payroll/payslips */
export class PayslipsQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsNumberString() month?: string;
  @IsOptional() @IsNumberString() year?: string;
}

/** GET /payroll/registers-records, GET /payroll/registers */
export class RegistersQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumberString() periodYear?: string;
  @IsOptional() @IsNumberString() periodMonth?: string;
  @IsOptional() @IsString() registerType?: string;
}

/** GET /payroll/runs */
export class PayrollRunsQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsNumberString() periodYear?: string;
  @IsOptional() @IsNumberString() periodMonth?: string;
  @IsOptional() @IsString() status?: string;
}

/** GET /payroll/queries */
export class QueriesListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}

/** GET /payroll/fnf */
export class FnfListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}

/** GET /client/payroll/inputs, GET /client/payroll/runs, status-by-branch, exceptions, pending-inputs, approvals */
export class ClientPayrollPeriodQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsNumberString() periodYear?: string;
  @IsOptional() @IsNumberString() periodMonth?: string;
  @IsOptional() @IsString() status?: string;
}

/** GET /client/payroll/registers-records, download-pack */
export class ClientRegistersQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumberString() periodYear?: string;
  @IsOptional() @IsNumberString() periodMonth?: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsString() search?: string;
}

/** GET /auditor/registers */
export class AuditorRegistersQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsNumberString() periodYear?: string;
  @IsOptional() @IsNumberString() periodMonth?: string;
  @IsOptional() @IsString() category?: string;
}
