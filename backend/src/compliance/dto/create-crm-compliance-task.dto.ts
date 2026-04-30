import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class CreateCrmComplianceTaskDto {
  @IsUUID() @IsNotEmpty() clientId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsUUID() @IsNotEmpty() complianceId: string;
  @IsInt() @Min(2020) @Max(2099) periodYear: number;
  @IsOptional() @IsInt() @Min(1) @Max(12) periodMonth?: number;
  @IsOptional() @IsString() periodLabel?: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsString() remarks?: string;
}
