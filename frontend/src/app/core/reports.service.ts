import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { ToastService } from '../shared/toast/toast.service';

export type PdfReportType = 'compliance' | 'risk-heatmap' | 'dtss';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient, private toast: ToastService) {}

  private buildParams(params: any): HttpParams {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') {
        p = p.set(k, String(v));
      }
    });
    return p;
  }

  summary(params: any): Observable<any> {
    const p = this.buildParams(params);
    return this.http.get(`${this.baseUrl}/api/v1/reports/compliance-summary`, { params: p });
  }

  overdue(params: any): Observable<any> {
    const p = this.buildParams(params);
    return this.http.get(`${this.baseUrl}/api/v1/reports/overdue`, { params: p });
  }

  contractorPerf(params: any): Observable<any> {
    const p = this.buildParams(params);
    return this.http.get(`${this.baseUrl}/api/v1/reports/contractor-performance`, { params: p });
  }

  /* ── PDF downloads ─────────────────────────────────────── */

  downloadPdf(type: PdfReportType, clientId: string, month?: string): Observable<void> {
    const url = `${this.baseUrl}/api/v1/reports/pdf/${type}/${encodeURIComponent(clientId)}`;
    return this.savePdf(url, `${type}-${clientId}-${month || 'all'}.pdf`, month);
  }

  static downloadError(error: { status?: number; name?: string }): string {
    if (error?.status === 401) return 'Your session has expired. Sign in again to download the report.';
    if (error?.status === 403) return 'Report access is unavailable. Ask your administrator to check your company and branch assignments.';
    if (error?.status === 400) return 'The report filters are invalid. Check the selected month and try again.';
    if (error?.status === 404) return 'This report is no longer available. Refresh the page and try again.';
    if (error?.status === 0) return 'Unable to connect. Check your connection and try again.';
    if (error?.name === 'TimeoutError') return 'The report is taking too long. Try a smaller period or retry later.';
    return 'The report could not be downloaded. Please try again.';
  }

  private savePdf(url: string, filename: string, month?: string): Observable<void> {
    return this.http.get(url, {
      responseType: 'blob',
      params: this.buildParams({ month }),
    }).pipe(
      timeout(60000),
      map((blob) => {
        const a = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        try {
          a.click();
        } finally {
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }
      }),
    );
  }

  downloadCeoDashboardPdf(): void {
    this.downloadBlob(`${this.baseUrl}/api/v1/reports/pdf/ceo-dashboard`, 'ceo-dashboard.pdf');
  }

  downloadComplianceSummaryPdf(clientId: string): void {
    this.downloadBlob(`${this.baseUrl}/api/v1/reports/pdf/compliance/${clientId}`, `compliance-summary-${clientId}.pdf`);
  }

  downloadRiskHeatmapPdf(clientId: string): void {
    this.downloadBlob(`${this.baseUrl}/api/v1/reports/pdf/risk-heatmap/${clientId}`, `risk-heatmap-${clientId}.pdf`);
  }

  downloadDtssPdf(clientId: string): void {
    this.downloadBlob(`${this.baseUrl}/api/v1/reports/pdf/dtss/${clientId}`, `dtss-${clientId}.pdf`);
  }

  private downloadBlob(url: string, filename: string): void {
    this.savePdf(url, filename).subscribe({
      error: (error) => this.toast.error(ReportsService.downloadError(error)),
    });
  }

  /* ── CSV export utility ────────────────────────────────── */

  static exportCsv(rows: any[], columns: { key: string; label: string }[], filename: string): void {
    if (!rows?.length) return;
    const header = columns.map(c => `"${c.label}"`).join(',');
    const body = rows.map(r =>
      columns.map(c => {
        const v = r[c.key] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(','),
    ).join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
