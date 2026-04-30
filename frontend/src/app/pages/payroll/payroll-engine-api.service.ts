import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export type RuleSet = {
  id: string;
  clientId: string;
  branchId: string | null;
  branchName?: string | null;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RuleParameter = {
  id: string;
  ruleSetId: string;
  key: string;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  notes: string | null;
};

export type SalaryStructure = {
  id: string;
  clientId: string;
  name: string;
  scopeType: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';
  branchId: string | null;
  departmentId: string | null;
  gradeId: string | null;
  employeeId: string | null;
  ruleSetId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StructureItem = {
  id: string;
  structureId: string;
  componentId: string;
  calcMethod: 'FIXED' | 'PERCENT' | 'FORMULA' | 'SLAB' | 'BALANCING';
  fixedAmount: number | null;
  percentage: number | null;
  percentageBase: string | null;
  formula: string | null;
  slabRef: any;
  balancingConfig: any;
  minAmount: number | null;
  maxAmount: number | null;
  roundingMode: string;
  priority: number;
  enabled: boolean;
};

@Injectable({ providedIn: 'root' })
export class PayrollEngineApiService {
  private base = `${environment.apiBaseUrl}/api/v1/payroll/engine`;
  constructor(private http: HttpClient) {}

  // Engine
  processWithEngine(runId: string): Observable<any> {
    return this.http.post(`${this.base}/runs/${runId}/process`, {});
  }

  previewEmployee(body: { clientId: string; employeeId?: string; branchId?: string; grossAmount: number; asOfDate: string }): Observable<Record<string, number>> {
    return this.http.post<Record<string, number>>(`${this.base}/preview`, body);
  }

  // Rule Sets
  listRuleSets(clientId: string): Observable<RuleSet[]> {
    return this.http.get<RuleSet[]>(`${this.base}/rule-sets`, { params: { clientId } });
  }
  getRuleSet(id: string): Observable<RuleSet> {
    return this.http.get<RuleSet>(`${this.base}/rule-sets/${id}`);
  }
  createRuleSet(body: Partial<RuleSet>): Observable<RuleSet> {
    return this.http.post<RuleSet>(`${this.base}/rule-sets`, body);
  }
  updateRuleSet(id: string, body: Partial<RuleSet>): Observable<RuleSet> {
    return this.http.put<RuleSet>(`${this.base}/rule-sets/${id}`, body);
  }
  deleteRuleSet(id: string): Observable<any> {
    return this.http.delete(`${this.base}/rule-sets/${id}`);
  }

  // Parameters
  listParameters(ruleSetId: string): Observable<RuleParameter[]> {
    return this.http.get<RuleParameter[]>(`${this.base}/rule-sets/${ruleSetId}/parameters`);
  }
  createParameter(ruleSetId: string, body: Partial<RuleParameter>): Observable<RuleParameter> {
    return this.http.post<RuleParameter>(`${this.base}/rule-sets/${ruleSetId}/parameters`, body);
  }
  updateParameter(ruleSetId: string, paramId: string, body: Partial<RuleParameter>): Observable<RuleParameter> {
    return this.http.put<RuleParameter>(`${this.base}/rule-sets/${ruleSetId}/parameters/${paramId}`, body);
  }
  deleteParameter(ruleSetId: string, paramId: string): Observable<any> {
    return this.http.delete(`${this.base}/rule-sets/${ruleSetId}/parameters/${paramId}`);
  }

  // Structures
  listStructures(clientId: string): Observable<SalaryStructure[]> {
    return this.http.get<SalaryStructure[]>(`${this.base}/structures`, { params: { clientId } });
  }
  getStructure(id: string): Observable<SalaryStructure> {
    return this.http.get<SalaryStructure>(`${this.base}/structures/${id}`);
  }
  createStructure(body: Partial<SalaryStructure>): Observable<SalaryStructure> {
    return this.http.post<SalaryStructure>(`${this.base}/structures`, body);
  }
  updateStructure(id: string, body: Partial<SalaryStructure>): Observable<SalaryStructure> {
    return this.http.put<SalaryStructure>(`${this.base}/structures/${id}`, body);
  }
  deleteStructure(id: string): Observable<any> {
    return this.http.delete(`${this.base}/structures/${id}`);
  }

  // Structure Items
  listStructureItems(structureId: string): Observable<StructureItem[]> {
    return this.http.get<StructureItem[]>(`${this.base}/structures/${structureId}/items`);
  }
  createStructureItem(structureId: string, body: Partial<StructureItem>): Observable<StructureItem> {
    return this.http.post<StructureItem>(`${this.base}/structures/${structureId}/items`, body);
  }
  updateStructureItem(structureId: string, itemId: string, body: Partial<StructureItem>): Observable<StructureItem> {
    return this.http.put<StructureItem>(`${this.base}/structures/${structureId}/items/${itemId}`, body);
  }
  deleteStructureItem(structureId: string, itemId: string): Observable<any> {
    return this.http.delete(`${this.base}/structures/${structureId}/items/${itemId}`);
  }
  bulkUpdateItems(structureId: string, items: Partial<StructureItem>[]): Observable<StructureItem[]> {
    return this.http.post<StructureItem[]>(`${this.base}/structures/${structureId}/items/bulk`, { items });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Client Structures (multi-client config engine)
  // ═══════════════════════════════════════════════════════════════════════════

  private csBase = `${environment.apiBaseUrl}/api/v1/payroll/client-structures`;

  listClientStructures(clientId: string): Observable<ClientStructure[]> {
    // Use stable endpoint to avoid 404 noise in environments where /all is not routed.
    return this.http.get<ClientStructure[]>(`${this.csBase}/client/${clientId}`);
  }
  getClientStructure(id: string): Observable<ClientStructure> {
    return this.http.get<ClientStructure>(`${this.csBase}/${id}`);
  }
  createClientStructure(body: CreateClientStructurePayload): Observable<ClientStructure> {
    return this.http.post<ClientStructure>(this.csBase, body);
  }
  updateClientStructure(id: string, body: Partial<ClientStructure>): Observable<ClientStructure> {
    return this.http.patch<ClientStructure>(`${this.csBase}/${id}`, body);
  }
  createNextVersion(id: string, effectiveFrom: string): Observable<ClientStructure> {
    return this.http.post<ClientStructure>(`${this.csBase}/${id}/next-version`, { effectiveFrom });
  }
  calculatePayroll(id: string, body: CalculatePayrollPayload): Observable<CalculatePayrollResult> {
    return this.http.post<CalculatePayrollResult>(`${this.csBase}/${id}/calculate`, body);
  }
}

// ── Client Structure types ────────────────────────────────────────────────────

export type ClientStructure = {
  id: string;
  clientId: string;
  name: string;
  code: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  components: StructureComponent[];
  statutoryConfigs: StatutoryConfig[];
  legacySource?: 'pay_salary_structures';
  legacyStructureId?: string;
  legacyRuleSetId?: string;
};

export type StructureComponent = {
  id: string;
  structureId: string;
  code: string;
  name: string;
  label: string;
  componentType: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  calculationMethod: 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'BALANCING' | 'CONDITIONAL_FIXED';
  displayOrder: number;
  fixedValue: number | null;
  percentageValue: number | null;
  basedOn: string | null;
  formula: string | null;
  roundRule: string;
  taxable: boolean;
  statutory: boolean;
  isVisibleInPayslip: boolean;
  isActive: boolean;
};

export type StatutoryConfig = {
  id: string;
  structureId: string;
  stateCode: string;
  minimumWage: number | null;
  warnIfGrossBelowMinWage: boolean;
  enablePt: boolean;
  enablePf: boolean;
  enableEsi: boolean;
  pfEmployeeRate: number;
  pfWageCap: number;
  pfApplyIfGrossAbove: number | null;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  esiGrossCeiling: number;
  carryForwardLeave: boolean;
  monthlyPaidLeaveAccrual: number;
  attendanceBonusAmount: number | null;
  attendanceBonusIfLopLte: number | null;
};

export type CreateClientStructurePayload = {
  clientId: string;
  name: string;
  code: string;
  version?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
  isDefault?: boolean;
  components: Array<{
    code: string;
    name: string;
    label: string;
    type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
    calculationMethod: 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'BALANCING' | 'CONDITIONAL_FIXED';
    displayOrder: number;
    fixedValue?: number;
    percentageValue?: number;
    basedOn?: string;
    formula?: string;
    roundRule?: string;
    taxable?: boolean;
    statutory?: boolean;
    isVisibleInPayslip?: boolean;
    isActive?: boolean;
  }>;
  statutoryConfigs: Array<{
    stateCode: string;
    minimumWage?: number;
    warnIfGrossBelowMinWage?: boolean;
    enablePt?: boolean;
    enablePf?: boolean;
    enableEsi?: boolean;
    pfEmployeeRate?: number;
    pfWageCap?: number;
    pfApplyIfGrossAbove?: number;
    esiEmployeeRate?: number;
    esiEmployerRate?: number;
    esiGrossCeiling?: number;
    carryForwardLeave?: boolean;
    monthlyPaidLeaveAccrual?: number;
    attendanceBonusAmount?: number;
    attendanceBonusIfLopLte?: number;
  }>;
};

export type CalculatePayrollPayload = {
  gross: number;
  lopDays: number;
  stateCode: string;
  month: number;
  year: number;
};

export type CalculatePayrollResult = {
  values: Record<string, number>;
  totalEarnings: number;
  totalDeductions: number;
  employerContributions: Record<string, number>;
  netPay: number;
  warnings: string[];
};
