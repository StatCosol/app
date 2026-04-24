import { IsString, IsOptional, IsBoolean, IsUUID, MaxLength, IsEnum } from 'class-validator';

export class CreateClraPeEstablishmentDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MaxLength(255)
  peName: string;

  @IsString()
  @MaxLength(255)
  establishmentName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  establishmentCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  registrationCertificateNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsString()
  @MaxLength(10)
  stateCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitType?: string;
}

export class CreateClraContractorDto {
  @IsString()
  @MaxLength(100)
  contractorCode: string;

  @IsString()
  @MaxLength(255)
  legalName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  stateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;
}

export class CreateClraAssignmentDto {
  @IsUUID()
  contractorId: string;

  @IsUUID()
  peEstablishmentId: string;

  @IsString()
  @MaxLength(120)
  assignmentCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contractNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  workOrderNo?: string;

  @IsString()
  @MaxLength(255)
  natureOfWork: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workLocationName?: string;

  @IsOptional()
  @IsString()
  workLocationAddress?: string;

  @IsString()
  @MaxLength(10)
  stateCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  licenceNo?: string;

  @IsOptional()
  @IsString()
  licenceValidFrom?: string;

  @IsOptional()
  @IsString()
  licenceValidTo?: string;

  @IsOptional()
  maximumWorkmen?: number;

  @IsOptional()
  @IsEnum(['MONTHLY', 'WEEKLY'])
  wagePeriodType?: string;

  @IsString()
  startDate: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class CreateClraWorkerDto {
  @IsUUID()
  contractorId: string;

  @IsString()
  @MaxLength(100)
  workerCode: string;

  @IsString()
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fatherOrSpouseName?: string;

  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  gender?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(['SKILLED', 'SEMI_SKILLED', 'UNSKILLED', 'HIGHLY_SKILLED'])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  aadhaarMasked?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  uan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  esiNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccountMasked?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  dateOfJoining?: string;
}

export class CreateClraDeploymentDto {
  @IsUUID()
  assignmentId: string;

  @IsUUID()
  workerId: string;

  @IsString()
  deploymentStart: string;

  @IsOptional()
  @IsString()
  deploymentEnd?: string;

  @IsOptional()
  ratePerDay?: number;

  @IsOptional()
  ratePerMonth?: number;

  @IsOptional()
  otRatePerHour?: number;
}

export class CreateClraWagePeriodDto {
  @IsUUID()
  assignmentId: string;

  @IsString()
  periodFrom: string;

  @IsString()
  periodTo: string;

  wageMonth: number;
  wageYear: number;

  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  paymentPlace?: string;
}

export class UpsertClraAttendanceDto {
  @IsUUID()
  wagePeriodId: string;

  @IsUUID()
  workerDeploymentId: string;

  @IsString()
  attendanceDate: string;

  @IsString()
  @MaxLength(20)
  status: string;

  @IsOptional()
  @IsString()
  inTime?: string;

  @IsOptional()
  @IsString()
  outTime?: string;

  @IsOptional()
  normalHours?: number;

  @IsOptional()
  otHours?: number;
}

export class UpsertClraWageDto {
  @IsUUID()
  wagePeriodId: string;

  @IsUUID()
  workerDeploymentId: string;

  daysWorked: number;
  basicWage: number;
  da?: number;
  hra?: number;
  otWages?: number;
  allowances?: number;
  grossWages: number;
  pfDeduction?: number;
  esiDeduction?: number;
  ptDeduction?: number;
  otherDeductions?: number;
  netWages: number;
}
