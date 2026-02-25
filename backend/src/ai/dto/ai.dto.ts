import { IsNotEmpty, IsOptional, IsString, IsUUID, IsEnum, IsInt } from 'class-validator';

export class RunRiskAssessmentDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsOptional()
  @IsString()
  assessmentType?: 'COMPLIANCE' | 'PAYROLL' | 'CONTRACTOR' | 'AUDIT';
}

export class GenerateAuditObservationDto {
  @IsUUID()
  @IsOptional()
  auditId?: string;

  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsNotEmpty()
  findingDescription: string;

  @IsString()
  @IsOptional()
  findingType?: string;

  @IsString()
  @IsOptional()
  applicableState?: string;
}

export class DetectPayrollAnomaliesDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsOptional()
  payrollRunId?: string;
}

export class UpdateAiConfigDto {
  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  modelName?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsOptional()
  temperature?: number;

  @IsOptional()
  maxTokens?: number;
}

export class ReviewObservationDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsString()
  @IsOptional()
  auditorNotes?: string;
}

export class ResolveAnomalyDto {
  @IsEnum(['RESOLVED', 'FALSE_POSITIVE'])
  status: 'RESOLVED' | 'FALSE_POSITIVE';

  @IsString()
  @IsOptional()
  resolutionNotes?: string;
}

export class DismissInsightDto {
  // no fields needed, just marks as dismissed
}

export class QueryDraftDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  queryTypeHint?: string;

  @IsOptional()
  @IsString()
  subject?: string;
}

export class DocumentCheckDto {
  // documentId is passed as a URL param; no body fields required
}

export class BranchRiskAssessmentDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsInt()
  @IsNotEmpty()
  year: number;

  @IsInt()
  @IsNotEmpty()
  month: number;
}
