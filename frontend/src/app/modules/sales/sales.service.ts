import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'PROPOSAL_SENT'
  | 'NEGOTIATION'
  | 'AGREEMENT_SENT'
  | 'WON'
  | 'LOST'
  | 'ON_HOLD';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LeadSource =
  | 'INBOUND'
  | 'REFERRAL'
  | 'OUTBOUND'
  | 'EVENT'
  | 'WEBSITE'
  | 'MARKETING'
  | 'PARTNER'
  | 'OTHER';

export type LeadActivityType =
  | 'CALL'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'MEETING'
  | 'PROPOSAL'
  | 'AGREEMENT'
  | 'NOTE';

export type LeadActivityOutcome =
  | 'NO_ANSWER'
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'FOLLOW_UP'
  | 'PROPOSAL_SENT'
  | 'AGREEMENT_SIGNED'
  | 'DECLINED'
  | 'OTHER';

export interface Lead {
  id: string;
  leadNo: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  designation: string | null;
  industry: string | null;
  state: string | null;
  city: string | null;
  employeeCount: number | null;
  source: LeadSource;
  sourceDetail: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  estimatedValue: string | number;
  probability: number;
  expectedCloseDate: string | null;
  nextFollowupAt: string | null;
  lastActivityAt: string | null;
  description: string | null;
  notes: string | null;
  ownerUserId: string | null;
  convertedClientId: string | null;
  convertedAt: string | null;
  lostReason: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  activityType: LeadActivityType;
  outcome: LeadActivityOutcome | null;
  occurredAt: string;
  nextFollowupAt: string | null;
  durationMinutes: number | null;
  subject: string | null;
  notes: string | null;
  performedBy: string | null;
  attachmentUrl: string | null;
  createdAt: string;
}

export interface ListLeadsResponse {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
}

export interface CeoSalesSummary {
  byStage: { stage: LeadStage; count: number; value: number }[];
  totals: {
    openCount: number;
    wonCount: number;
    lostCount: number;
    openValue: number;
    wonValue: number;
  } | null;
  byOwner: {
    ownerUserId: string | null;
    ownerName: string | null;
    total: number;
    open: number;
    won: number;
    lost: number;
    openValue: number;
  }[];
}

export interface CeoFollowupItem {
  id: string;
  leadNo: string | null;
  companyName: string;
  contactName: string | null;
  contactPhone: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  ownerUserId: string | null;
  ownerName: string | null;
  nextFollowupAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  estimatedValue: number;
  daysSinceActivity: number | null;
}

export interface CeoFollowupsResponse {
  buckets: Record<string, CeoFollowupItem[]>;
  counts: Record<string, number>;
}

export interface CeoReceivables {
  buckets: { bucket: string; invoiceCount: number; balance: number }[];
  totals: { openInvoices: number; outstanding: number; overdueAmount: number };
  topClients: {
    billingClientId: string;
    clientName: string | null;
    outstanding: number;
    overdue: number;
    invoiceCount: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  // -------- Leads --------
  list(opts: {
    bucket?: 'open' | 'won' | 'lost' | 'archived' | 'all';
    stage?: LeadStage;
    priority?: LeadPriority;
    source?: LeadSource;
    ownerUserId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Observable<ListLeadsResponse> {
    let p = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return this.http.get<ListLeadsResponse>(`${this.base}/sales/leads`, { params: p });
  }

  get(id: string): Observable<Lead> {
    return this.http.get<Lead>(`${this.base}/sales/leads/${id}`);
  }

  create(body: Partial<Lead> & { companyName: string }): Observable<Lead> {
    return this.http.post<Lead>(`${this.base}/sales/leads`, body);
  }

  update(id: string, body: Partial<Lead>): Observable<Lead> {
    return this.http.patch<Lead>(`${this.base}/sales/leads/${id}`, body);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sales/leads/${id}`);
  }

  myFollowups(): Observable<Lead[]> {
    return this.http.get<Lead[]>(`${this.base}/sales/leads/followups/mine`);
  }

  // -------- Activities --------
  listActivities(leadId: string): Observable<LeadActivity[]> {
    return this.http.get<LeadActivity[]>(`${this.base}/sales/leads/${leadId}/activities`);
  }

  addActivity(leadId: string, body: Partial<LeadActivity> & { activityType: LeadActivityType }) {
    return this.http.post<LeadActivity>(`${this.base}/sales/leads/${leadId}/activities`, body);
  }

  // -------- CEO --------
  ceoSalesSummary(): Observable<CeoSalesSummary> {
    return this.http.get<CeoSalesSummary>(`${this.base}/ceo/sales/summary`);
  }

  ceoFollowups(): Observable<CeoFollowupsResponse> {
    return this.http.get<CeoFollowupsResponse>(`${this.base}/ceo/sales/followups`);
  }

  ceoReceivables(): Observable<CeoReceivables> {
    return this.http.get<CeoReceivables>(`${this.base}/ceo/receivables/summary`);
  }
}
