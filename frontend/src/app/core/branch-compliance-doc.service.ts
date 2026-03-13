import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ComplianceDocFilters {
  branchId?: string;
  companyId?: string;
  year?: number;
  month?: number;
  quarter?: number;
  half?: number;
  frequency?: string;
  status?: string;
  lawArea?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface ReturnMasterItem {
  returnCode: string;
  returnName: string;
  lawArea: string;
  frequency: string;
  category: string | null;
  dueDay: number | null;
  scopeDefault: string;
  applicableFor: string;
  isActive: boolean;
}

export interface ComplianceDoc {
  id: string;
  companyId: string;
  branchId: string | null;
  returnCode: string;
  returnName: string;
  lawArea: string;
  frequency: string;
  periodYear: number;
  periodMonth: number | null;
  periodQuarter: number | null;
  periodHalf: number | null;
  dueDate: string | null;
  uploadedFileUrl: string | null;
  uploadedFileName: string | null;
  uploadedAt: string | null;
  status: string;
  remarks: string | null;
  uploaderRemarks: string | null;
  version: number;
  isLocked: boolean;
  reviewedAt: string | null;
  branch?: { id: string; branchName: string } | null;
}

export interface ChecklistItem {
  returnCode: string;
  returnName: string;
  lawArea: string;
  frequency: string;
  category: string | null;
  dueDay: number | null;
  document: {
    id: string;
    status: string;
    uploadedFileName: string | null;
    uploadedAt: string | null;
    version: number;
    remarks: string | null;
    uploaderRemarks: string | null;
    reviewedAt: string | null;
    isLocked: boolean;
    dueDate: string | null;
  } | null;
}

export interface BranchComplianceKpis {
  total: number;
  approved: number;
  submitted: number;
  resubmitted: number;
  reupload_required: number;
  not_uploaded: number;
  overdue: number;
  compliance_pct: number;
  // Weighted compliance scoring
  monthly_compliance: number;
  quarterly_compliance: number;
  half_yearly_compliance: number;
  yearly_compliance: number;
  overall_weighted: number;
}

export interface WeightedCompliance {
  monthly_compliance: number;
  quarterly_compliance: number;
  half_yearly_compliance: number;
  yearly_compliance: number;
  overall_weighted: number;
}

export interface ClientBranchComplianceKpis {
  overallCompliancePct: number;
  totalBranches: number;
  branches: Array<{
    branch_id: string;
    branch_name: string;
    total: number;
    approved: number;
    pending_review: number;
    reupload_required: number;
    not_uploaded: number;
    compliance_pct: number;
  }>;
  top5Compliant: any[];
  bottom5Risky: any[];
}

export interface ComplianceTrendPoint {
  month: number;
  total: number;
  approved: number;
  percent: number;
}

export interface RiskExposure {
  riskScore: number;
  overdue: number;
  reupload: number;
  pending: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SidebarBadges {
  MONTHLY: { overdue: number; reupload: number };
  QUARTERLY: { overdue: number; reupload: number };
  HALF_YEARLY: { overdue: number; reupload: number };
  YEARLY: { overdue: number; reupload: number };
}

export interface FullComplianceDashboard {
  monthlyCompliance: number;
  quarterlyCompliance: number;
  halfYearlyCompliance: number;
  yearlyCompliance: number;
  overallCompliance: number;
  total: number;
  approved: number;
  submitted: number;
  resubmitted: number;
  reuploadRequired: number;
  notUploaded: number;
  overdueCount: number;
  compliancePct: number;
  riskScore: number;
  riskLevel: string;
  riskBreakdown: { overdue: number; reupload: number; pending: number };
  trend: ComplianceTrendPoint[];
  badges: SidebarBadges;
}

export interface LowestBranch {
  branchId: string;
  branchName: string;
  total: number;
  approved: number;
  compliancePct: number;
  overdueCount: number;
  riskScore: number;
}

@Injectable({ providedIn: 'root' })
export class BranchComplianceDocService {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly branchBase = `${this.baseUrl}/api/v1/branch/compliance-docs`;
  private readonly crmBase = `${this.baseUrl}/api/v1/crm/branch-compliance`;
  private readonly clientBase = `${this.baseUrl}/api/v1/client/branch-compliance`;
  private readonly auditorBase = `${this.baseUrl}/api/v1/auditor/compliance-docs`;
  private readonly adminBase = `${this.baseUrl}/api/v1/admin/branch-compliance`;

  constructor(private http: HttpClient) {}

  // ─── Branch User APIs ─────────────────────────────────────

  /** Get checklist of required returns with current status */
  getChecklist(filters: ComplianceDocFilters): Observable<{ data: ChecklistItem[]; total: number }> {
    return this.http.get<{ data: ChecklistItem[]; total: number }>(
      `${this.branchBase}/checklist`,
      { params: this.toParams(filters) },
    );
  }

  /** List uploaded documents */
  listBranchDocs(filters: ComplianceDocFilters): Observable<{ data: ComplianceDoc[]; total: number }> {
    return this.http.get<{ data: ComplianceDoc[]; total: number }>(
      this.branchBase,
      { params: this.toParams(filters) },
    );
  }

  /** Upload compliance document */
  uploadDocument(formData: FormData): Observable<ComplianceDoc> {
    return this.http.post<ComplianceDoc>(`${this.branchBase}/upload`, formData);
  }

  /** Get return master types */
  getReturnMaster(filters?: Partial<ComplianceDocFilters>): Observable<ReturnMasterItem[]> {
    return this.http.get<ReturnMasterItem[]>(
      `${this.branchBase}/return-master`,
      { params: this.toParams(filters || {}) },
    );
  }

  /** Branch dashboard KPIs */
  getBranchKpis(params: { branchId: string; year: number; month?: number }): Observable<BranchComplianceKpis> {
    return this.http.get<BranchComplianceKpis>(
      `${this.branchBase}/dashboard-kpis`,
      { params: this.toParams(params) },
    );
  }

  /** Weighted compliance scoring breakdown */
  getWeightedCompliance(params: { branchId: string; year: number }): Observable<WeightedCompliance> {
    return this.http.get<WeightedCompliance>(
      `${this.branchBase}/weighted-compliance`,
      { params: this.toParams(params) },
    );
  }

  // ─── CRM APIs ─────────────────────────────────────────────

  /** List documents pending CRM review */
  listCrmDocs(filters: ComplianceDocFilters): Observable<{ data: ComplianceDoc[]; total: number }> {
    return this.http.get<{ data: ComplianceDoc[]; total: number }>(
      this.crmBase,
      { params: this.toParams(filters) },
    );
  }

  /** Approve or reject a document */
  reviewDocument(docId: string, status: 'APPROVED' | 'REUPLOAD_REQUIRED', remarks?: string): Observable<ComplianceDoc> {
    return this.http.patch<ComplianceDoc>(
      `${this.crmBase}/${docId}/review`,
      { status, remarks },
    );
  }

  /** CRM return master */
  getCrmReturnMaster(filters?: any): Observable<ReturnMasterItem[]> {
    return this.http.get<ReturnMasterItem[]>(
      `${this.crmBase}/return-master`,
      { params: this.toParams(filters || {}) },
    );
  }

  /** CRM dashboard KPIs */
  getCrmKpis(params: { companyId?: string; year?: number; month?: number }): Observable<any> {
    return this.http.get(`${this.crmBase}/dashboard-kpis`, { params: this.toParams(params) });
  }

  // ─── Client (Master) APIs ─────────────────────────────────

  /** List all branch compliance docs for a company */
  listClientDocs(filters: ComplianceDocFilters): Observable<{ data: ComplianceDoc[]; total: number }> {
    return this.http.get<{ data: ComplianceDoc[]; total: number }>(
      this.clientBase,
      { params: this.toParams(filters) },
    );
  }

  /** Client dashboard KPIs (branch-wise) */
  getClientKpis(params: { companyId?: string; year: number; month?: number }): Observable<ClientBranchComplianceKpis> {
    return this.http.get<ClientBranchComplianceKpis>(
      `${this.clientBase}/dashboard-kpis`,
      { params: this.toParams(params) },
    );
  }

  // ─── Auditor APIs ─────────────────────────────────────────

  /** Auditor read-only list */
  listAuditorDocs(filters: ComplianceDocFilters): Observable<{ data: ComplianceDoc[]; total: number }> {
    return this.http.get<{ data: ComplianceDoc[]; total: number }>(
      this.auditorBase,
      { params: this.toParams(filters) },
    );
  }

  // ─── Admin APIs ───────────────────────────────────────────

  /** Admin: list return master */
  listAdminReturnMaster(filters?: any): Observable<ReturnMasterItem[]> {
    return this.http.get<ReturnMasterItem[]>(
      `${this.adminBase}/return-master`,
      { params: this.toParams(filters || {}) },
    );
  }

  /** Admin: create return master entry */
  createReturnMaster(dto: any): Observable<ReturnMasterItem> {
    return this.http.post<ReturnMasterItem>(`${this.adminBase}/return-master`, dto);
  }

  /** Admin: update return master entry */
  updateReturnMaster(returnCode: string, dto: any): Observable<ReturnMasterItem> {
    return this.http.patch<ReturnMasterItem>(`${this.adminBase}/return-master/${returnCode}`, dto);
  }

  // ─── Intelligence Layer APIs ──────────────────────────────

  /** Unified branch compliance dashboard (KPIs + trend + risk + badges) */
  getFullDashboard(params: { branchId: string; year: number }): Observable<FullComplianceDashboard> {
    return this.http.get<FullComplianceDashboard>(
      `${this.branchBase}/dashboard/full`,
      { params: this.toParams(params) },
    );
  }

  /** 12-month compliance trend for a branch */
  getComplianceTrend(params: { branchId: string; year: number }): Observable<ComplianceTrendPoint[]> {
    return this.http.get<ComplianceTrendPoint[]>(
      `${this.branchBase}/trend`,
      { params: this.toParams(params) },
    );
  }

  /** Risk exposure score for a branch */
  getRiskExposure(params: { branchId: string; year: number }): Observable<RiskExposure> {
    return this.http.get<RiskExposure>(
      `${this.branchBase}/risk`,
      { params: this.toParams(params) },
    );
  }

  /** Sidebar badge counts per compliance frequency */
  getSidebarBadges(params: { branchId: string; year: number }): Observable<SidebarBadges> {
    return this.http.get<SidebarBadges>(
      `${this.branchBase}/badges`,
      { params: this.toParams(params) },
    );
  }

  /** Top 10 lowest compliance branches (client view) */
  getLowestBranches(params: { companyId?: string; year: number; limit?: number }): Observable<LowestBranch[]> {
    return this.http.get<LowestBranch[]>(
      `${this.clientBase}/lowest-branches`,
      { params: this.toParams(params) },
    );
  }

  /** Company-wide compliance trend (client view) */
  getCompanyTrend(params: { companyId?: string; year: number }): Observable<ComplianceTrendPoint[]> {
    return this.http.get<ComplianceTrendPoint[]>(
      `${this.clientBase}/trend`,
      { params: this.toParams(params) },
    );
  }

  // ─── Helpers ──────────────────────────────────────────────

  private toParams(obj: Record<string, any>): HttpParams {
    let params = new HttpParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return params;
  }
}
