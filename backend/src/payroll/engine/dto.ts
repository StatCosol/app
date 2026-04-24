import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PreviewEmployeeDto {
  @IsUUID() clientId: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() branchId?: string;
  @Type(() => Number)
  @IsNumber() grossAmount: number;
  @IsString() asOfDate: string;
}

export class CreateRuleSetDto {
  @IsUUID() clientId: string;
  @IsOptional() @IsString() branchId?: string;
  @IsString() name: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateRuleSetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateParameterDto {
  @IsString() key: string;
  @IsOptional() @IsNumber() valueNum?: number;
  @IsOptional() @IsString() valueText?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateParameterDto {
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsNumber() valueNum?: number;
  @IsOptional() @IsString() valueText?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateStructureDto {
  @IsUUID() clientId: string;
  @IsString() name: string;
  @IsIn(['TENANT', 'BRANCH', 'DEPARTMENT', 'GRADE', 'EMPLOYEE'])
  scopeType: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() gradeId?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsUUID() ruleSetId?: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateStructureDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional()
  @IsIn(['TENANT', 'BRANCH', 'DEPARTMENT', 'GRADE', 'EMPLOYEE'])
  scopeType?: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() gradeId?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsUUID() ruleSetId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateStructureItemDto {
  @IsUUID() componentId: string;
  @IsIn(['FIXED', 'PERCENT', 'FORMULA', 'SLAB', 'BALANCING'])
  calcMethod: 'FIXED' | 'PERCENT' | 'FORMULA' | 'SLAB' | 'BALANCING';
  @IsOptional() @IsNumber() fixedAmount?: number | null;
  @IsOptional() @IsNumber() percentage?: number | null;
  @IsOptional()
  @IsIn(['BASIC', 'GROSS', 'CTC', 'PF_WAGE', 'ESI_WAGE'])
  percentageBase?: 'BASIC' | 'GROSS' | 'CTC' | 'PF_WAGE' | 'ESI_WAGE' | null;
  @IsOptional() @IsString() formula?: string | null;
  @IsOptional() @IsObject() slabRef?: Record<string, unknown> | null;
  @IsOptional() @IsObject() balancingConfig?: Record<string, unknown> | null;
  @IsOptional() @IsNumber() minAmount?: number | null;
  @IsOptional() @IsNumber() maxAmount?: number | null;
  @IsOptional() @IsString() roundingMode?: string;
  @IsOptional() @IsNumber() priority?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateStructureItemDto extends CreateStructureItemDto {}
