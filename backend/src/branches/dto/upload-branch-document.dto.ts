import { IsOptional, IsString, IsIn } from 'class-validator';

export class UploadBranchDocumentDto {
  @IsOptional()
  @IsIn(['REGISTRATION', 'COMPLIANCE_MONTHLY', 'AUDIT_EVIDENCE'])
  category?: 'REGISTRATION' | 'COMPLIANCE_MONTHLY' | 'AUDIT_EVIDENCE';

  @IsOptional() @IsString() docType?: string;
  @IsOptional() periodYear?: number;
  @IsOptional() periodMonth?: number;
}
