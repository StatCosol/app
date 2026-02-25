import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AiConfig {
  configured: boolean;
  provider?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  isActive?: boolean;
}

export interface AiStatus {
  aiEnabled: boolean;
  message: string;
}

export interface RiskAssessment {
  id: string;
  clientId: string;
  assessmentType: string;
  riskScore: number;
  riskLevel: string;
  inspectionProbability: number | null;
  penaltyExposureMin: number | null;
  penaltyExposureMax: number | null;
  summary: string;
  riskFactors: RiskFactor[];
  recommendations: Recommendation[];
  predictions: Record<string, any>;
  inputData: Record<string, any>;
  aiModel: string | null;
  periodMonth: number | null;
  periodYear: number | null;
  createdAt: string;
}

export interface RiskFactor {
  factor: string;
  weight: number;
  value: string;
  detail: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  impact: string;
}

export interface HighRiskClient {
  id: string;
  client_id: string;
  client_name: string;
  client_code: string;
  risk_score: number;
  risk_level: string;
  summary: string;
  inspection_probability: number;
  penalty_exposure_min: number;
  penalty_exposure_max: number;
  created_at: string;
}

export interface PlatformRiskSummary {
  total_assessed: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  avg_score: string;
  total_exposure_min: string;
  total_exposure_max: string;
  activeInsights: Record<string, number>;
}

export interface AiInsight {
  id: string;
  clientId: string | null;
  insightType: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  data: Record<string, any>;
  isDismissed: boolean;
  createdAt: string;
}

export interface AuditObservation {
  id: string;
  auditId: string | null;
  clientId: string;
  branchId: string | null;
  findingType: string | null;
  findingDescription: string;
  observationTitle: string | null;
  observationText: string | null;
  consequence: string | null;
  sectionReference: string | null;
  fineEstimationMin: number | null;
  fineEstimationMax: number | null;
  riskRating: string;
  correctiveAction: string | null;
  timelineDays: number | null;
  applicableState: string | null;
  stateSpecificRules: string | null;
  confidenceScore: number | null;
  status: string;
  auditorNotes: string | null;
  aiModel: string | null;
  createdAt: string;
}

export interface PayrollAnomaly {
  id: string;
  clientId: string;
  branchId: string | null;
  employeeId: string | null;
  payrollRunId: string | null;
  anomalyType: string;
  severity: string;
  description: string;
  details: Record<string, any>;
  recommendation: string | null;
  status: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  detectedAt: string;
}

export interface AnomalySummary {
  total: string;
  open: string;
  high_open: string;
  critical_open: string;
  unique_types: string;
}

@Injectable({ providedIn: 'root' })
export class AiApiService {
  private base = '/api/v1/ai';

  constructor(private http: HttpClient) {}

  // ─── Config ───────────────────────────────────────
  getConfig(): Observable<AiConfig> {
    return this.http.get<AiConfig>(`${this.base}/config`);
  }

  updateConfig(config: Partial<{ provider: string; modelName: string; apiKey: string; temperature: number; maxTokens: number }>): Observable<any> {
    return this.http.put(`${this.base}/config`, config);
  }

  getStatus(): Observable<AiStatus> {
    return this.http.get<AiStatus>(`${this.base}/status`);
  }

  // ─── Risk Engine ──────────────────────────────────
  runRiskAssessment(clientId: string, assessmentType = 'COMPLIANCE'): Observable<RiskAssessment> {
    return this.http.post<RiskAssessment>(`${this.base}/risk/assess`, { clientId, assessmentType });
  }

  getClientRisk(clientId: string): Observable<RiskAssessment> {
    return this.http.get<RiskAssessment>(`${this.base}/risk/client/${clientId}`);
  }

  getClientRiskHistory(clientId: string, limit = 10): Observable<RiskAssessment[]> {
    return this.http.get<RiskAssessment[]>(`${this.base}/risk/client/${clientId}/history`, { params: { limit: limit.toString() } });
  }

  getHighRiskClients(limit = 20): Observable<HighRiskClient[]> {
    return this.http.get<HighRiskClient[]>(`${this.base}/risk/high-risk`, { params: { limit: limit.toString() } });
  }

  getPlatformRiskSummary(): Observable<PlatformRiskSummary> {
    return this.http.get<PlatformRiskSummary>(`${this.base}/risk/summary`);
  }

  // ─── Insights ─────────────────────────────────────
  getInsights(clientId?: string, limit = 50): Observable<AiInsight[]> {
    const params: any = { limit: limit.toString() };
    if (clientId) params.clientId = clientId;
    return this.http.get<AiInsight[]>(`${this.base}/insights`, { params });
  }

  dismissInsight(id: string): Observable<any> {
    return this.http.put(`${this.base}/insights/${id}/dismiss`, {});
  }

  // ─── Audit Observations ───────────────────────────
  generateAuditObservation(params: {
    clientId: string;
    findingDescription: string;
    auditId?: string;
    branchId?: string;
    findingType?: string;
    applicableState?: string;
  }): Observable<AuditObservation> {
    return this.http.post<AuditObservation>(`${this.base}/audit/generate-observation`, params);
  }

  listAuditObservations(filters?: { clientId?: string; auditId?: string; status?: string }): Observable<AuditObservation[]> {
    return this.http.get<AuditObservation[]>(`${this.base}/audit/observations`, { params: filters as any });
  }

  getAuditObservation(id: string): Observable<AuditObservation> {
    return this.http.get<AuditObservation>(`${this.base}/audit/observations/${id}`);
  }

  reviewAuditObservation(id: string, status: 'APPROVED' | 'REJECTED', auditorNotes?: string): Observable<AuditObservation> {
    return this.http.put<AuditObservation>(`${this.base}/audit/observations/${id}/review`, { status, auditorNotes });
  }

  // ─── Payroll Anomalies ────────────────────────────
  detectPayrollAnomalies(clientId: string, payrollRunId?: string): Observable<PayrollAnomaly[]> {
    return this.http.post<PayrollAnomaly[]>(`${this.base}/payroll/detect-anomalies`, { clientId, payrollRunId });
  }

  listPayrollAnomalies(clientId: string, filters?: { status?: string; type?: string }): Observable<PayrollAnomaly[]> {
    const params: any = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.type) params.type = filters.type;
    return this.http.get<PayrollAnomaly[]>(`${this.base}/payroll/anomalies/${clientId}`, { params });
  }

  getPayrollAnomalySummary(clientId: string): Observable<AnomalySummary> {
    return this.http.get<AnomalySummary>(`${this.base}/payroll/anomaly-summary/${clientId}`);
  }

  resolvePayrollAnomaly(id: string, status: 'RESOLVED' | 'FALSE_POSITIVE', notes?: string): Observable<PayrollAnomaly> {
    return this.http.put<PayrollAnomaly>(`${this.base}/payroll/anomalies/${id}/resolve`, { status, resolutionNotes: notes });
  }

  // ─── Dashboard ────────────────────────────────────
  getAiDashboard(): Observable<{ riskSummary: PlatformRiskSummary; recentInsights: AiInsight[] }> {
    return this.http.get<any>(`${this.base}/dashboard`);
  }

  // ─── Query Draft (Auto-Route + Reply) ─────────────
  generateQueryDraft(message: string, opts?: { queryTypeHint?: string; subject?: string }): Observable<any> {
    return this.http.post(`${this.base}/query-draft`, { message, ...opts });
  }

  // ─── Document Check ───────────────────────────────
  runDocumentCheck(documentId: string): Observable<any> {
    return this.http.post(`${this.base}/document-check/${documentId}`, {});
  }

  listDocumentChecks(filters?: { clientId?: string; branchId?: string; result?: string; limit?: number }): Observable<any[]> {
    const params: any = {};
    if (filters?.clientId) params.clientId = filters.clientId;
    if (filters?.branchId) params.branchId = filters.branchId;
    if (filters?.result) params.result = filters.result;
    if (filters?.limit) params.limit = filters.limit.toString();
    return this.http.get<any[]>(`${this.base}/document-checks`, { params });
  }

  // ─── Branch Risk Assessment ───────────────────────
  runBranchRiskAssessment(branchId: string, year: number, month: number): Observable<any> {
    return this.http.post(`${this.base}/risk/branch-assess`, { branchId, year, month });
  }

  // ─── AI Request Audit Trail ───────────────────────
  listAiRequests(opts?: { module?: string; status?: string; limit?: number }): Observable<any[]> {
    const params: any = {};
    if (opts?.module) params.module = opts.module;
    if (opts?.status) params.status = opts.status;
    if (opts?.limit) params.limit = opts.limit.toString();
    return this.http.get<any[]>(`${this.base}/requests`, { params });
  }

  getAiRequest(id: string): Observable<any> {
    return this.http.get(`${this.base}/requests/${id}`);
  }
}
