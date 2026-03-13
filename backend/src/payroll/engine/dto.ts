export class PreviewEmployeeDto {
  clientId: string;
  employeeId: string | null = null;
  branchId: string | null = null;
  grossAmount: number;
  asOfDate: string;
}

export class CreateRuleSetDto {
  clientId: string;
  branchId?: string;
  name: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export class UpdateRuleSetDto {
  name?: string;
  branchId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export class CreateParameterDto {
  key: string;
  valueNum?: number;
  valueText?: string;
  unit?: string;
  notes?: string;
}

export class UpdateParameterDto {
  key?: string;
  valueNum?: number;
  valueText?: string;
  unit?: string;
  notes?: string;
}

export class CreateStructureDto {
  clientId: string;
  name: string;
  scopeType: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';
  branchId?: string;
  departmentId?: string;
  gradeId?: string;
  employeeId?: string;
  ruleSetId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export class UpdateStructureDto {
  name?: string;
  scopeType?: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';
  branchId?: string;
  departmentId?: string;
  gradeId?: string;
  employeeId?: string;
  ruleSetId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export class CreateStructureItemDto {
  componentId: string;
  calcMethod: 'FIXED' | 'PERCENT' | 'FORMULA' | 'SLAB' | 'BALANCING';
  fixedAmount?: number | null;
  percentage?: number | null;
  percentageBase?: 'BASIC' | 'GROSS' | 'CTC' | 'PF_WAGE' | 'ESI_WAGE' | null;
  formula?: string | null;
  slabRef?: Record<string, unknown> | null;
  balancingConfig?: Record<string, unknown> | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  roundingMode?: string;
  priority?: number;
  enabled?: boolean;
}

export class UpdateStructureItemDto extends CreateStructureItemDto {}
