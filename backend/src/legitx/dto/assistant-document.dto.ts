import {
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DashboardQueryDto } from './dashboard-query.dto';

export class AssistantDocumentDto extends DashboardQueryDto {
  @IsOptional()
  @IsUUID()
  nonComplianceId?: string;
  @IsString()
  @MinLength(3)
  @MaxLength(400)
  request: string;
}

export class AssistantDocumentViewDto {
  @IsOptional()
  @IsIn(['CERTIFICATE', 'RENEWAL', 'CHALLAN', 'ACKNOWLEDGEMENT'])
  variant?: string;
  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @IsOptional()
  @IsUUID()
  nonComplianceId?: string;
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;
}
