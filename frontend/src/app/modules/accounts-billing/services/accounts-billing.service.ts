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

  updateInvoice(id: string, data: any): Observable<Invoice> {
    return this.http.patch<Invoice>(`${this.base}/invoices/${id}`, data);
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
  generatePdf(invoiceId: string): Observable<Blob> {
    return this.http.post(`${this.base}/invoices/${invoiceId}/generate-pdf`, {}, {
      responseType: 'blob',
    });
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

  // ── Recurring Invoices ──
  getRecurringConfigs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/recurring`);
  }

  createRecurringConfig(data: any): Observable<any> {
    return this.http.post(`${this.base}/recurring`, data);
  }

  updateRecurringConfig(id: string, data: any): Observable<any> {
    return this.http.patch(`${this.base}/recurring/${id}`, data);
  }

  toggleRecurringConfig(id: string, isActive: boolean): Observable<any> {
    return this.http.patch(`${this.base}/recurring/${id}/toggle`, { isActive });
  }

  deleteRecurringConfig(id: string): Observable<any> {
    return this.http.delete(`${this.base}/recurring/${id}`);
  }

  runRecurringNow(): Observable<any> {
    return this.http.post(`${this.base}/recurring/run-now`, {});
  }

  // ── Pending Payment Follow-ups ──
  listPendingPayments(params?: Record<string, string>): Observable<any> {
    return this.http.get<any>(`${this.base}/pending-payments`, { params });
  }

  uploadPendingPaymentsCsv(
    file: File,
    autoSend: boolean,
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<any>(
      `${this.base}/pending-payments/upload?autoSend=${autoSend ? '1' : '0'}`,
      fd,
    );
  }

  sendPendingPaymentReminder(id: string): Observable<any> {
    return this.http.post<any>(
      `${this.base}/pending-payments/${id}/send-reminder`,
      {},
    );
  }

  sendPendingPaymentReminders(ids: string[]): Observable<any> {
    return this.http.post<any>(
      `${this.base}/pending-payments/send-reminders`,
      { ids },
    );
  }

  updatePendingPayment(id: string, data: any): Observable<any> {
    return this.http.patch<any>(
      `${this.base}/pending-payments/${id}`,
      data,
    );
  }

  deletePendingPayment(id: string): Observable<any> {
    return this.http.delete<any>(`${this.base}/pending-payments/${id}`);
  }

  setPendingPaymentPause(id: string, paused: boolean): Observable<any> {
    return this.http.patch<any>(
      `${this.base}/pending-payments/${id}/pause`,
      { paused },
    );
  }

  pendingPaymentsCsvTemplateUrl(): string {
    return `${this.base}/pending-payments/template.csv`;
  }

  downloadPendingPaymentsCsvTemplate(): Observable<Blob> {
    return this.http.get(`${this.base}/pending-payments/template.csv`, {
      responseType: 'blob',
    });
  }
}
