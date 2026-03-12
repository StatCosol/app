import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CeoDashboardData {
  pendingApprovals: number;
  escalations: number;
  overdue: number;
  compliancePending: number;
}

export interface CeoSummary {
  totalClients: number;
  totalBranches: number;
  teamSize: number;
  activeAudits: number;
  overdueCompliances: number;
  pendingApprovals: number;
  complianceScore30d: number;
}

export interface CeoClientOverviewItem {
  id: string;
  clientName: string;
  clientCode: string;
  crmName: string;
  auditorName: string;
  branchCount: number;
  overdueCount: number;
  activeAudits: number;
}

export interface CeoCcoCrmPerformanceItem {
  userId: string;
  userName: string;
  email: string;
  roleCode: string;
  clientCount: number;
  branchCount: number;
  overdueCount: number;
  complianceScore: number;
}

export interface CeoGovernanceCompliance {
  completedAudits: number;
  pendingAudits: number;
  criticalObservations: number;
  compliantItems: number;
  overdueItems: number;
  dueSoonItems: number;
  overallComplianceRate: number;
  auditCompletionRate90d: number;
}

export interface CeoEscalationItem {
  id: string;
  requestType: string;
  targetEntityType: string;
  status: string;
  reason: string;
  createdAt: string;
  requestedByName: string;
  entityName: string;
}

export interface CeoComplianceTrendItem {
  month: string;
  totalItems: number;
  compliantItems: number;
  overdueItems: number;
  complianceRate: number;
  totalAudits: number;
  completedAudits: number;
  avgAuditScore: number;
}

export interface CeoBranchRankingItem {
  id: string;
  branchName: string;
  clientName: string;
  totalItems: number;
  compliantCount: number;
  overdueCount: number;
  complianceRate: number;
  riskScore: number;
}

export interface CeoBranchRankings {
  month: string | null;
  topRisk: CeoBranchRankingItem[];
  bottomRisk: CeoBranchRankingItem[];
}

export interface CeoAuditClosureTrendItem {
  month: string;
  totalAudits: number;
  completedAudits: number;
  openAudits: number;
  closureRate: number;
}

@Injectable({ providedIn: 'root' })
export class CeoDashboardService {
  constructor(private http: HttpClient) {}

  getDashboardData(): Observable<CeoDashboardData> {
    return this.http.get<CeoDashboardData>('/api/v1/ceo/dashboard');
  }

  getSummary(): Observable<CeoSummary> {
    return this.http.get<CeoSummary>('/api/v1/ceo/dashboard/summary');
  }

  getClientOverview(params?: any): Observable<{ items: CeoClientOverviewItem[] }> {
    return this.http.get<{ items: CeoClientOverviewItem[] }>('/api/v1/ceo/dashboard/client-overview', { params });
  }

  getCcoCrmPerformance(): Observable<{ items: CeoCcoCrmPerformanceItem[] }> {
    return this.http.get<{ items: CeoCcoCrmPerformanceItem[] }>('/api/v1/ceo/dashboard/cco-crm-performance');
  }

  getGovernanceCompliance(): Observable<CeoGovernanceCompliance> {
    return this.http.get<CeoGovernanceCompliance>('/api/v1/ceo/dashboard/governance-compliance');
  }

  getRecentEscalations(params?: any): Observable<{ items: CeoEscalationItem[] }> {
    return this.http.get<{ items: CeoEscalationItem[] }>('/api/v1/ceo/dashboard/recent-escalations', { params });
  }

  getComplianceTrend(months = 12): Observable<{ items: CeoComplianceTrendItem[] }> {
    return this.http.get<{ items: CeoComplianceTrendItem[] }>('/api/v1/ceo/dashboard/compliance-trend', {
      params: { months: String(months) },
    });
  }

  getBranchRankings(month?: string, limit = 10): Observable<CeoBranchRankings> {
    const params: any = { limit: String(limit) };
    if (month) params.month = month;
    return this.http.get<CeoBranchRankings>('/api/v1/ceo/dashboard/branch-rankings', { params });
  }

  getAuditClosureTrend(months = 12): Observable<{ items: CeoAuditClosureTrendItem[] }> {
    return this.http.get<{ items: CeoAuditClosureTrendItem[] }>('/api/v1/ceo/dashboard/audit-closure-trend', {
      params: { months: String(months) },
    });
  }
}
