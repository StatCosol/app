import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  BillingClient, Invoice, InvoicePayment, InvoiceEmailLog,
  BillingSetting, DashboardStats, PagedResult,
} from '../models/billing.models';

@Injectable({ providedIn: 'root' })
export class AccountsBillingService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/billing`;

  constructor(private http: HttpClient) {}

  // ── Billing Clients ──
  getClients(params?: Record<string, string>): Observable<PagedResult<BillingClient>> {
    return this.http.get<PagedResult<BillingClient>>(`${this.base}/clients`, { params });
  }

  getActiveClients(): Observable<BillingClient[]> {
    return this.http.get<BillingClient[]>(`${this.base}/clients/active`);
  }

  getClient(id: string): Observable<BillingClient> {
    return this.http.get<BillingClient>(`${this.base}/clients/${id}`);
  }

  createClient(data: Partial<BillingClient>): Observable<BillingClient> {
    return this.http.post<BillingClient>(`${this.base}/clients`, data);
  }

  updateClient(id: string, data: Partial<BillingClient>): Observable<BillingClient> {
    return this.http.patch<BillingClient>(`${this.base}/clients/${id}`, data);
  }

  // ── Invoices ──
  getInvoices(params?: Record<string, string>): Observable<PagedResult<Invoice>> {
    return this.http.get<PagedResult<Invoice>>(`${this.base}/invoices`, { params });
  }

  getInvoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.base}/invoices/${id}`);
  }

  createInvoice(data: any): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.base}/invoices`, data);
  }

  approveInvoice(id: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.base}/invoices/${id}/approve`, {});
  }

  cancelInvoice(id: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.base}/invoices/${id}/cancel`, {});
  }

  getDashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.base}/invoices/stats/dashboard`);
  }

  getGstSummary(fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/invoices/reports/gst-summary`, {
      params: { fromDate, toDate },
    });
  }

  // ── PDF & Email ──
  generatePdf(invoiceId: string): Observable<{ pdfPath: string }> {
    return this.http.post<{ pdfPath: string }>(`${this.base}/invoices/${invoiceId}/generate-pdf`, {});
  }

  sendInvoiceEmail(invoiceId: string, data: any): Observable<any> {
    return this.http.post(`${this.base}/invoices/${invoiceId}/send-email`, data);
  }

  getEmailLogs(params?: Record<string, string>): Observable<PagedResult<InvoiceEmailLog>> {
    return this.http.get<PagedResult<InvoiceEmailLog>>(`${this.base}/email-logs`, { params });
  }

  // ── Payments ──
  recordPayment(invoiceId: string, data: any): Observable<InvoicePayment> {
    return this.http.post<InvoicePayment>(`${this.base}/invoices/${invoiceId}/payments`, data);
  }

  getInvoicePayments(invoiceId: string): Observable<InvoicePayment[]> {
    return this.http.get<InvoicePayment[]>(`${this.base}/invoices/${invoiceId}/payments`);
  }

  getAllPayments(params?: Record<string, string>): Observable<PagedResult<InvoicePayment>> {
    return this.http.get<PagedResult<InvoicePayment>>(`${this.base}/payments`, { params });
  }

  // ── Settings ──
  getSettings(): Observable<BillingSetting> {
    return this.http.get<BillingSetting>(`${this.base}/settings`);
  }

  updateSettings(data: Partial<BillingSetting>): Observable<BillingSetting> {
    return this.http.patch<BillingSetting>(`${this.base}/settings`, data);
  }
}
