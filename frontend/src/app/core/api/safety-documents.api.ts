import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/* ═══ Interfaces ═══ */

export interface SafetyDocument {
  id: string;
  branchId: string;
  branchName?: string;
  clientId: string;
  documentType: string;
  documentName: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  remarks: string | null;
  category: string | null;
  frequency: string | null;
  applicableTo: string | null;
  periodMonth: number | null;
  periodQuarter: number | null;
  periodYear: number | null;
  isMandatory: boolean;
  verifiedByCrm: boolean;
  crmVerifiedAt: string | null;
  verifiedByAuditor: boolean;
  auditorVerifiedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ExpiringDocument {
  id: string;
  documentType: string;
  documentName: string;
  validTo: string;
  category: string;
  branchName: string;
  daysRemaining: number;
}

export interface MasterDocument {
  id: number;
  document_name: string;
  category: string;
  frequency: string;
  applicable_to: string;
  is_mandatory: boolean;
  sort_order: number;
}

export interface SafetyScore {
  overallScore: number;
  categoryScores: {
    category: string;
    weight: number;
    uploaded: number;
    required: number;
    score: number;
  }[];
}

/* ═══ Document type labels ═══ */

export const SAFETY_DOCUMENT_TYPES = [
  'Fire Safety Certificate',
  'Factory License',
  'Pollution Consent (Air)',
  'Pollution Consent (Water)',
  'Electrical Safety Audit',
  'First Aid Certificate',
  'Safety Committee Minutes',
  'Fire Drill Report',
  'PPE Issue Register',
  'Accident Report (Form 25)',
  'Health Check Report',
  'Dangerous Occurrence Report',
  'Material Safety Data Sheet',
  'Emergency Evacuation Plan',
  'Safety Training Record',
  'Housekeeping Inspection',
  'Machine Guarding Certificate',
  'Pressure Vessel Test',
  'Building Stability Certificate',
  'Hazardous Waste Manifest',
  'Noise Level Assessment',
  'Lifting Equipment Inspection',
  'Safety Audit Report',
  'Other',
];

/* ═══ Category labels ═══ */

export const SAFETY_CATEGORIES = [
  'Safety Inspections',
  'Incident Reports',
  'Training & Awareness',
  'Safety Audits',
  'Equipment Inspections',
  'Medical & Health',
  'Emergency Preparedness',
  'Statutory Safety Certificates',
  'Environmental Safety',
  'Event Based Incidents',
];

export const SAFETY_FREQUENCIES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half Yearly' },
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'EVENT_BASED', label: 'Event Based' },
  { value: 'AS_NEEDED', label: 'As Needed' },
];

@Injectable({ providedIn: 'root' })
export class SafetyDocumentsApi {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private http: HttpClient) {}

  /* ── Branch endpoints ── */

  uploadDocument(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.base}/branch/safety-documents/upload`, formData);
  }

  listForBranch(filters?: { documentType?: string; category?: string; frequency?: string }): Observable<SafetyDocument[]> {
    let params = new HttpParams();
    if (filters?.documentType) params = params.set('documentType', filters.documentType);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    return this.http.get<SafetyDocument[]>(`${this.base}/branch/safety-documents`, { params });
  }

  deleteBranch(docId: string): Observable<any> {
    return this.http.delete(`${this.base}/branch/safety-documents/${docId}`);
  }

  downloadBranch(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/branch/safety-documents/${docId}/download`, { responseType: 'blob' });
  }

  getExpiringBranch(): Observable<ExpiringDocument[]> {
    return this.http.get<ExpiringDocument[]>(`${this.base}/branch/safety-documents/expiring`);
  }

  getMasterList(filters?: { frequency?: string; category?: string; applicableTo?: string }): Observable<MasterDocument[]> {
    let params = new HttpParams();
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.applicableTo) params = params.set('applicableTo', filters.applicableTo);
    return this.http.get<MasterDocument[]>(`${this.base}/branch/safety-documents/master`, { params });
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/branch/safety-documents/categories`);
  }

  getSafetyScoreBranch(): Observable<SafetyScore> {
    return this.http.get<SafetyScore>(`${this.base}/branch/safety-documents/safety-score`);
  }

  /* ── Client endpoints ── */

  listForClient(filters?: { branchId?: string; documentType?: string; category?: string; frequency?: string }): Observable<SafetyDocument[]> {
    let params = new HttpParams();
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.documentType) params = params.set('documentType', filters.documentType);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    return this.http.get<SafetyDocument[]>(`${this.base}/client/safety-documents`, { params });
  }

  downloadClient(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/client/safety-documents/${docId}/download`, { responseType: 'blob' });
  }

  getExpiringClient(): Observable<ExpiringDocument[]> {
    return this.http.get<ExpiringDocument[]>(`${this.base}/client/safety-documents/expiring`);
  }

  getSafetyScoreClient(): Observable<SafetyScore> {
    return this.http.get<SafetyScore>(`${this.base}/client/safety-documents/safety-score`);
  }

  /* ── CRM endpoints ── */

  listForCrm(clientId: string, filters?: { branchId?: string; documentType?: string; category?: string; frequency?: string }): Observable<SafetyDocument[]> {
    let params = new HttpParams().set('clientId', clientId);
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.documentType) params = params.set('documentType', filters.documentType);
    if (filters?.category) params = params.set('category', filters.category);
    if (filters?.frequency) params = params.set('frequency', filters.frequency);
    return this.http.get<SafetyDocument[]>(`${this.base}/crm/safety-documents`, { params });
  }

  downloadCrm(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/crm/safety-documents/${docId}/download`, { responseType: 'blob' });
  }

  getExpiringCrm(clientId: string): Observable<ExpiringDocument[]> {
    return this.http.get<ExpiringDocument[]>(`${this.base}/crm/safety-documents/expiring`, {
      params: new HttpParams().set('clientId', clientId),
    });
  }

  getSafetyScoreCrm(clientId: string): Observable<SafetyScore> {
    return this.http.get<SafetyScore>(`${this.base}/crm/safety-documents/safety-score`, {
      params: new HttpParams().set('clientId', clientId),
    });
  }

  verifyCrm(docId: string): Observable<any> {
    return this.http.patch(`${this.base}/crm/safety-documents/${docId}/verify`, {});
  }
}
