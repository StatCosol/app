import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type PayrollSummary = {
  assignedClients: number;
  totalEmployees: number;
  activeEmployees: number;
  exitedEmployees: number;
  pendingRuns: number;
  completedThisMonth: number;
  totalRuns: number;
  pfPending: number;
  esiPending: number;
  joinersThisMonth: number;
  leaversThisMonth: number;
};

export type PayrollClient = {
  id: string;
  name: string;
  clientName?: string;
  clientCode?: string;
  status?: string;
};

export interface PfEsiPendingEmployee {
  employeeId: string;
  empCode: string;
  name: string;
  dateOfJoining: string | null;
  pendingDays: number;
  uanAvailable?: boolean;
  uan?: string | null;
  ipNumberAvailable?: boolean;
  ipNumber?: string | null;
}

export interface PfEsiClientSummary {
  clientId: string;
  clientName: string;
  pf: { registered: number; pending: number; pendingEmployees: PfEsiPendingEmployee[] };
  esi: { registered: number; pending: number; pendingEmployees: PfEsiPendingEmployee[] };
}

export interface PfEsiSummaryResponse {
  clients: PfEsiClientSummary[];
  totals: { pfRegistered: number; pfPending: number; esiRegistered: number; esiPending: number };
}

export interface PfEsiGapRow extends PfEsiPendingEmployee {
  scheme: 'PF' | 'ESI';
  clientId: string;
  clientName: string;
}

export interface PfEsiRemittanceRow {
  runId: string;
  clientId: string;
  clientName: string | null;
  periodYear: number;
  periodMonth: number;
  runStatus: string;
  remittanceState: 'READY' | 'IN_PROGRESS' | 'NOT_STARTED' | 'REWORK' | 'UNKNOWN';
  employeeCount: number;
  updatedAt: string | null;
}

export interface PfEsiChallanRow {
  id: string;
  clientId: string;
  clientName: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  title: string;
  registerType: string | null;
  approvalStatus: string;
  createdAt: string | null;
  downloadUrl: string | null;
  scheme: 'PF' | 'ESI' | 'UNKNOWN';
}

export interface PayrollEmployee {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  department: string | null;
  dateOfJoining: string | null;
  dateOfExit: string | null;
  isActive: boolean;
  pfApplicable: boolean;
  pfRegistered: boolean;
  esiApplicable: boolean;
  esiRegistered: boolean;
  uan: string | null;
  esic: string | null;
  phone: string | null;
  email: string | null;
  clientId: string;
  clientName: string;
}

export interface PayrollEmployeeDetail extends PayrollEmployee {
  dateOfBirth?: string | null;
  fatherName?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  stateCode?: string | null;
  pfApplicableFrom?: string | null;
  esiApplicableFrom?: string | null;
  runHistory: PayrollRunHistoryItem[];
}

export interface PayrollRunHistoryItem {
  id: string;
  runId: string;
  periodYear: number;
  periodMonth: number;
  runStatus: string;
  grossEarnings: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  runDate: string;
}

export interface PayrollQuery {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  clientId: string;
  clientName: string;
  employeeId: string | null;
  employeeName: string | null;
  raisedByName: string;
}

export interface PayrollQueryDetail extends PayrollQuery {
  description: string | null;
  resolution: string | null;
  messages: PayrollQueryMessage[];
}

export interface PayrollQueryMessage {
  id: string;
  queryId: string;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface PayrollFnfItem {
  id: string;
  separationDate: string;
  lastWorkingDay: string | null;
  reason: string | null;
  status: string;
  settlementAmount: number | null;
  createdAt: string;
  clientId: string;
  clientName: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
}

export interface PayrollFnfChecklistItem {
  label: string;
  done: boolean;
}

export interface PayrollFnfHistoryEvent {
  id: string;
  action: string;
  statusFrom: string | null;
  statusTo: string;
  remarks: string | null;
  settlementAmount: number | null;
  performedBy: string | null;
  createdAt: string;
}

export interface PayrollFnfDetail extends PayrollFnfItem {
  remarks: string | null;
  checklist: PayrollFnfChecklistItem[];
  settlementBreakup?: Record<string, number> | null;
  history: PayrollFnfHistoryEvent[];
  initiatedBy: string | null;
  approvedBy: string | null;
  updatedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class PayrollApiService {
  private base = `${environment.apiBaseUrl}/api/v1/payroll`;

  constructor(private http: HttpClient) {}

  /** Get branches for a given client (for dropdown lookups) */
  getOptionBranches(clientId?: string): Observable<{ id: string; branchName: string; branchType?: string; stateCode?: string }[]> {
    let params = new HttpParams();
    if (clientId) params = params.set('clientId', clientId);
    return this.http.get<{ id: string; branchName: string; branchType?: string; stateCode?: string }[]>(
      `${this.base}/options/branches`,
      { params },
    );
  }

  getSummary(): Observable<PayrollSummary> {
    return this.http.get<any>(`${this.base}/summary`).pipe(
      map((r) => ({
        assignedClients: Number(r?.assignedClients ?? 0),
        totalEmployees: Number(r?.totalEmployees ?? 0),
        activeEmployees: Number(r?.activeEmployees ?? 0),
        exitedEmployees: Number(r?.exitedEmployees ?? 0),
        pendingRuns: Number(r?.pendingRuns ?? 0),
        completedThisMonth: Number(r?.completedThisMonth ?? 0),
        totalRuns: Number(r?.totalRuns ?? 0),
        pfPending: Number(r?.pfPending ?? 0),
        esiPending: Number(r?.esiPending ?? 0),
        joinersThisMonth: Number(r?.joinersThisMonth ?? 0),
        leaversThisMonth: Number(r?.leaversThisMonth ?? 0),
      }))
    );
  }

  getAssignedClients(): Observable<PayrollClient[]> {
    return this.http.get<any[]>(`${this.base}/clients`).pipe(
      map((clients) =>
        clients.map(c => ({
          id: c.id,
          name: c.clientName || c.name || c.client_name || 'Unknown Client',
          clientName: c.clientName || c.client_name,
          clientCode: c.clientCode || c.client_code,
          status: c.status,
        }))
      )
    );
  }

  getPfEsiSummary(): Observable<PfEsiSummaryResponse> {
    return this.http.get<PfEsiSummaryResponse>(`${this.base}/pf-esi-summary`);
  }

  getPfEsiGaps(clientId?: string): Observable<PfEsiGapRow[]> {
    return this.getPfEsiSummary().pipe(
      map((summary) => {
        const sourceClients = clientId
          ? (summary?.clients || []).filter((c) => c.clientId === clientId)
          : (summary?.clients || []);

        const rows: PfEsiGapRow[] = [];
        for (const client of sourceClients) {
          for (const emp of client.pf.pendingEmployees || []) {
            rows.push({
              ...emp,
              scheme: 'PF',
              clientId: client.clientId,
              clientName: client.clientName,
            });
          }
          for (const emp of client.esi.pendingEmployees || []) {
            rows.push({
              ...emp,
              scheme: 'ESI',
              clientId: client.clientId,
              clientName: client.clientName,
            });
          }
        }

        return rows.sort((a, b) => Number(b.pendingDays || 0) - Number(a.pendingDays || 0));
      }),
    );
  }

  getPfEsiRemittances(q: {
    clientId?: string;
    periodYear?: number;
    periodMonth?: number;
  }): Observable<PfEsiRemittanceRow[]> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.periodYear) p = p.set('periodYear', String(q.periodYear));
    if (q.periodMonth) p = p.set('periodMonth', String(q.periodMonth));

    return this.http.get<any>(`${this.base}/runs`, { params: p }).pipe(
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return (arr || []).map((r: any) => {
          const status = String(r?.status || '').toUpperCase();
          let remittanceState: PfEsiRemittanceRow['remittanceState'] = 'UNKNOWN';
          if (status === 'APPROVED' || status === 'COMPLETED') remittanceState = 'READY';
          else if (status === 'PROCESSED' || status === 'SUBMITTED' || status === 'PROCESSING') remittanceState = 'IN_PROGRESS';
          else if (status === 'DRAFT') remittanceState = 'NOT_STARTED';
          else if (status === 'REJECTED') remittanceState = 'REWORK';

          return {
            runId: String(r?.id ?? ''),
            clientId: String(r?.clientId ?? r?.client_id ?? ''),
            clientName: r?.clientName ?? r?.client_name ?? null,
            periodYear: Number(r?.periodYear ?? r?.period_year ?? 0),
            periodMonth: Number(r?.periodMonth ?? r?.period_month ?? 0),
            runStatus: status || 'UNKNOWN',
            remittanceState,
            employeeCount: Number(r?.employeeCount ?? r?.employee_count ?? 0),
            updatedAt: r?.updatedAt ?? r?.updated_at ?? null,
          } as PfEsiRemittanceRow;
        });
      }),
    );
  }

  getPfEsiChallans(q: {
    clientId?: string;
    periodYear?: number;
    periodMonth?: number;
  }): Observable<PfEsiChallanRow[]> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.periodYear) p = p.set('periodYear', String(q.periodYear));
    if (q.periodMonth) p = p.set('periodMonth', String(q.periodMonth));

    return this.http.get<any>(`${this.base}/registers`, { params: p }).pipe(
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return (arr || [])
          .map((r: any) => {
            const title = String(r?.title || '');
            const registerType = String(r?.registerType ?? r?.register_type ?? '');
            const blob = `${title} ${registerType}`.toLowerCase();
            const looksPfEsi =
              blob.includes('pf') ||
              blob.includes('epf') ||
              blob.includes('ecr') ||
              blob.includes('esi') ||
              blob.includes('esic') ||
              blob.includes('challan') ||
              blob.includes('return');
            if (!looksPfEsi) return null;

            let scheme: PfEsiChallanRow['scheme'] = 'UNKNOWN';
            if (blob.includes('esi') || blob.includes('esic')) scheme = 'ESI';
            else if (blob.includes('pf') || blob.includes('epf') || blob.includes('ecr')) scheme = 'PF';

            return {
              id: String(r?.id ?? ''),
              clientId: String(r?.clientId ?? r?.client_id ?? ''),
              clientName: r?.clientName ?? r?.client_name ?? null,
              periodYear: r?.periodYear !== undefined && r?.periodYear !== null
                ? Number(r.periodYear)
                : r?.period_year !== undefined && r?.period_year !== null
                  ? Number(r.period_year)
                  : null,
              periodMonth: r?.periodMonth !== undefined && r?.periodMonth !== null
                ? Number(r.periodMonth)
                : r?.period_month !== undefined && r?.period_month !== null
                  ? Number(r.period_month)
                  : null,
              title,
              registerType: registerType || null,
              approvalStatus: String(r?.approvalStatus ?? r?.approval_status ?? 'PENDING').toUpperCase(),
              createdAt: r?.createdAt ?? r?.created_at ?? null,
              downloadUrl: r?.downloadUrl ?? null,
              scheme,
            } as PfEsiChallanRow;
          })
          .filter((row: PfEsiChallanRow | null): row is PfEsiChallanRow => !!row)
          .sort((a: PfEsiChallanRow, b: PfEsiChallanRow) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          });
      }),
    );
  }

  downloadPfEsiChallan(recordId: string, fallbackFileName = 'pf-esi-record.pdf'): Observable<void> {
    return this.http
      .get(`${this.base}/registers-records/${recordId}/download`, {
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((res: HttpResponse<Blob>) => {
          const blob = res.body ?? new Blob();
          const fileName = this.fileNameFromDisposition(res.headers.get('content-disposition')) || fallbackFileName;
          this.saveBlob(blob, fileName);
        }),
      );
  }

  // ── Employees ──
  getEmployees(q: {
    clientId?: string;
    status?: string;
    search?: string;
    pfStatus?: string;
    esiStatus?: string;
    page?: number;
    limit?: number;
  }): Observable<{ data: PayrollEmployee[]; total: number }> {
    let p = new HttpParams();
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.status) p = p.set('status', q.status);
    if (q.search) p = p.set('search', q.search);
    if (q.pfStatus) p = p.set('pfStatus', q.pfStatus);
    if (q.esiStatus) p = p.set('esiStatus', q.esiStatus);
    if (q.page) p = p.set('page', String(q.page));
    if (q.limit) p = p.set('limit', String(q.limit));
    return this.http.get<{ data: PayrollEmployee[]; total: number }>(`${this.base}/employees`, { params: p });
  }

  getEmployeeDetail(employeeId: string): Observable<PayrollEmployeeDetail> {
    return this.http.get<PayrollEmployeeDetail>(`${this.base}/employees/${employeeId}`);
  }

  // ── Queries ──
  getQueries(q: {
    status?: string;
    clientId?: string;
    priority?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<{ data: PayrollQuery[]; total: number }> {
    let p = new HttpParams();
    if (q.status) p = p.set('status', q.status);
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.priority) p = p.set('priority', q.priority);
    if (q.category) p = p.set('category', q.category);
    if (q.search) p = p.set('search', q.search);
    if (q.page) p = p.set('page', String(q.page));
    if (q.limit) p = p.set('limit', String(q.limit));
    return this.http.get<{ data: PayrollQuery[]; total: number }>(`${this.base}/queries`, { params: p });
  }

  getQueryDetail(queryId: string): Observable<PayrollQueryDetail> {
    return this.http.get<PayrollQueryDetail>(`${this.base}/queries/${queryId}`);
  }

  createQuery(dto: {
    clientId: string;
    subject: string;
    category?: string;
    priority?: string;
    description?: string;
    employeeId?: string;
  }): Observable<any> {
    return this.http.post(`${this.base}/queries`, dto);
  }

  addQueryMessage(queryId: string, message: string): Observable<any> {
    return this.http.post(`${this.base}/queries/${queryId}/messages`, { message });
  }

  resolveQuery(queryId: string, resolution: string): Observable<any> {
    return this.http.patch(`${this.base}/queries/${queryId}/resolve`, { resolution });
  }

  updateQueryStatus(queryId: string, status: string): Observable<any> {
    return this.http.patch(`${this.base}/queries/${queryId}/status`, { status });
  }

  // ── F&F ──
  getFnfList(q: {
    status?: string;
    clientId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<{ data: PayrollFnfItem[]; total: number }> {
    let p = new HttpParams();
    if (q.status) p = p.set('status', q.status);
    if (q.clientId) p = p.set('clientId', q.clientId);
    if (q.search) p = p.set('search', q.search);
    if (q.page) p = p.set('page', String(q.page));
    if (q.limit) p = p.set('limit', String(q.limit));
    return this.http.get<{ data: PayrollFnfItem[]; total: number }>(`${this.base}/fnf`, { params: p });
  }

  getFnfDetail(fnfId: string): Observable<any> {
    return this.http.get<any>(`${this.base}/fnf/${fnfId}`).pipe(
      map((r) => ({
        id: String(r?.id ?? ''),
        separationDate: r?.separationDate ?? r?.separation_date ?? '',
        lastWorkingDay: r?.lastWorkingDay ?? r?.last_working_day ?? null,
        reason: r?.reason ?? null,
        status: String(r?.status ?? 'INITIATED').toUpperCase(),
        settlementAmount: r?.settlementAmount !== undefined && r?.settlementAmount !== null
          ? Number(r.settlementAmount)
          : null,
        createdAt: r?.createdAt ?? r?.created_at ?? '',
        clientId: String(r?.clientId ?? r?.client_id ?? ''),
        clientName: r?.clientName ?? r?.client_name ?? '',
        employeeId: String(r?.employeeId ?? r?.employee_id ?? ''),
        employeeName: r?.employeeName ?? '',
        employeeCode: r?.employeeCode ?? '',
        remarks: r?.remarks ?? null,
        checklist: Array.isArray(r?.checklist)
          ? r.checklist.map((item: any) => ({
              label: String(item?.label ?? item?.name ?? 'Checklist item'),
              done: item?.done === true || item?.status === true || item?.status === 'DONE',
            }))
          : [],
        settlementBreakup: r?.settlementBreakup ?? r?.settlement_breakup ?? null,
        history: Array.isArray(r?.history)
          ? r.history.map((event: any) => ({
              id: String(event?.id ?? ''),
              action: String(event?.action ?? 'STATUS_UPDATE'),
              statusFrom: event?.statusFrom ?? event?.status_from ?? null,
              statusTo: String(event?.statusTo ?? event?.status_to ?? ''),
              remarks: event?.remarks ?? null,
              settlementAmount:
                event?.settlementAmount !== undefined && event?.settlementAmount !== null
                  ? Number(event.settlementAmount)
                  : null,
              performedBy: event?.performedBy ?? event?.performed_by ?? null,
              createdAt: event?.createdAt ?? event?.created_at ?? '',
            }))
          : [],
        initiatedBy: r?.initiatedBy ?? r?.initiated_by ?? null,
        approvedBy: r?.approvedBy ?? r?.approved_by ?? null,
        updatedAt: r?.updatedAt ?? r?.updated_at ?? null,
      }) as PayrollFnfDetail),
    );
  }

  createFnf(dto: {
    clientId: string;
    employeeId: string;
    separationDate: string;
    lastWorkingDay?: string;
    reason?: string;
    remarks?: string;
  }): Observable<any> {
    return this.http.post(`${this.base}/fnf`, dto);
  }

  updateFnfStatus(
    fnfId: string,
    status: string,
    options?: {
      remarks?: string;
      settlementAmount?: number;
      settlementBreakup?: Record<string, number>;
      checklist?: PayrollFnfChecklistItem[];
    },
  ): Observable<any> {
    return this.http.patch(`${this.base}/fnf/${fnfId}/status`, {
      status,
      remarks: options?.remarks,
      settlementAmount: options?.settlementAmount,
      settlementBreakup: options?.settlementBreakup,
      checklist: options?.checklist,
    });
  }

  getFullAndFinalCases(q: {
    status?: string;
    clientId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<{ data: PayrollFnfItem[]; total: number }> {
    return this.getFnfList(q);
  }

  getFullAndFinalCaseById(fnfId: string): Observable<PayrollFnfDetail> {
    return this.getFnfDetail(fnfId);
  }

  approveFullAndFinal(fnfId: string, remarks?: string): Observable<any> {
    return this.updateFnfStatus(fnfId, 'APPROVED', { remarks });
  }

  settleFullAndFinal(
    fnfId: string,
    amount: number,
    settlementBreakup?: Record<string, number>,
    remarks?: string,
  ): Observable<any> {
    return this.updateFnfStatus(fnfId, 'SETTLED', {
      settlementAmount: amount,
      settlementBreakup,
      remarks,
    });
  }

  // ── F&F Settlement Documents ──
  uploadFnfDocument(fnfId: string, file: File, docType: string, docName: string, remarks?: string): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    fd.append('docName', docName);
    if (remarks) fd.append('remarks', remarks);
    return this.http.post(`${this.base}/fnf/${fnfId}/documents`, fd);
  }

  listFnfDocuments(fnfId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/fnf/${fnfId}/documents`);
  }

  downloadFnfDocument(docId: string, docName: string): void {
    this.http.get(`${this.base}/fnf/documents/${docId}/download`, { responseType: 'blob' }).subscribe((blob) => {
      this.saveBlob(blob, docName || 'document');
    });
  }

  deleteFnfDocument(docId: string): Observable<any> {
    return this.http.delete(`${this.base}/fnf/documents/${docId}`);
  }

  // ── Report Downloads ──
  downloadBankStatement(params?: { runId?: string; clientId?: string; year?: number; month?: number }): void {
    const q = new URLSearchParams();
    if (params?.runId) q.set('runId', params.runId);
    if (params?.clientId) q.set('clientId', params.clientId);
    if (params?.year) q.set('year', String(params.year));
    if (params?.month) q.set('month', String(params.month));
    this.downloadCsv(`${this.base}/reports/bank-statement?${q.toString()}`);
  }

  downloadMusterRoll(params?: { clientId?: string; year?: number; month?: number }): void {
    const q = new URLSearchParams();
    if (params?.clientId) q.set('clientId', params.clientId);
    if (params?.year) q.set('year', String(params.year));
    if (params?.month) q.set('month', String(params.month));
    this.downloadCsv(`${this.base}/reports/muster-roll?${q.toString()}`);
  }

  downloadCostAnalysis(params?: { clientId?: string; year?: number }): void {
    const q = new URLSearchParams();
    if (params?.clientId) q.set('clientId', params.clientId);
    if (params?.year) q.set('year', String(params.year));
    this.downloadCsv(`${this.base}/reports/cost-analysis?${q.toString()}`);
  }

  downloadForm16(params?: { clientId?: string; financialYear?: string }): void {
    const q = new URLSearchParams();
    if (params?.clientId) q.set('clientId', params.clientId);
    if (params?.financialYear) q.set('financialYear', params.financialYear);
    this.downloadCsv(`${this.base}/reports/form16?${q.toString()}`);
  }

  private downloadCsv(url: string): void {
    this.http.get(url, { responseType: 'blob' }).subscribe((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const match = url.match(/filename="?([^"&]+)"?/);
      a.download = match ? match[1] : 'report.csv';
      // Extract filename from Content-Disposition if available or use a default
      a.download = 'report.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private fileNameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const simpleMatch = disposition.match(/filename="?([^"]+)"?/i);
    return simpleMatch?.[1] || null;
  }
}
