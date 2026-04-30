import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ToastService } from '../shared/toast/toast.service';

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
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: () => this.toast.error('Failed to download report. Please try again.'),
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
