import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export type RuleSet = {
  id: string;
  clientId: string;
  branchId: string | null;
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
}
