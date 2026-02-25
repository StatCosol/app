import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PageHeaderComponent } from '../../../shared/ui';
import { environment } from '../../../../environments/environment';

interface PayrollSummary {
  assignedClients: number;
  pendingRuns: number;
  completedThisMonth: number;
}

interface PayrollClient {
  id: string;
  clientName: string;
  clientCode: string;
  status: string;
}

interface PayrollRun {
  id: string;
  clientName: string;
  month: string;
  status: string;
  employeeCount: number;
  grossTotal: number;
  createdAt: string;
}

@Component({
  standalone: true,
  selector: 'app-crm-payroll-status',
  imports: [CommonModule, PageHeaderComponent, FormsModule],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="Payroll Status" description="Payroll processing status for your assigned clients"></ui-page-header>

      <!-- Loading state -->
      @if (loading()) {
        <div class="flex items-center justify-center py-12">
          <div class="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
          <span class="ml-3 text-sm text-gray-500">Loading payroll data…</span>
        </div>
      }

      <!-- Error state -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p class="text-sm text-red-700">{{ error() }}</p>
          <button (click)="loadAll()" class="mt-2 text-xs font-medium text-red-600 hover:text-red-800 underline">Retry</button>
        </div>
      }

      @if (!loading()) {
        <!-- KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned Clients</p>
            <p class="mt-1 text-2xl font-bold text-gray-900">{{ summary().assignedClients }}</p>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Runs</p>
            <p class="mt-1 text-2xl font-bold" [class]="summary().pendingRuns > 0 ? 'text-amber-600' : 'text-gray-900'">{{ summary().pendingRuns }}</p>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Completed This Month</p>
            <p class="mt-1 text-2xl font-bold text-emerald-600">{{ summary().completedThisMonth }}</p>
          </div>
        </div>

        <!-- Tab bar -->
        <div class="border-b border-gray-200 mb-4">
          <nav class="flex gap-6 -mb-px">
            <button (click)="activeTab.set('clients')"
              [class]="activeTab() === 'clients'
                ? 'border-indigo-500 text-indigo-600 border-b-2 pb-3 text-sm font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 border-b-2 pb-3 text-sm font-medium'">
              Clients ({{ clients().length }})
            </button>
            <button (click)="activeTab.set('runs')"
              [class]="activeTab() === 'runs'
                ? 'border-indigo-500 text-indigo-600 border-b-2 pb-3 text-sm font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 border-b-2 pb-3 text-sm font-medium'">
              Payroll Runs ({{ runs().length }})
            </button>
          </nav>
        </div>

        <!-- Clients Tab -->
        @if (activeTab() === 'clients') {
          @if (clients().length === 0) {
            <div class="bg-gray-50 rounded-lg p-8 text-center">
              <p class="text-sm text-gray-500">No assigned clients found.</p>
            </div>
          } @else {
            <div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client Name</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (c of clients(); track c.id) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ c.clientName || '—' }}</td>
                      <td class="px-4 py-3 text-sm text-gray-600">{{ c.clientCode || '—' }}</td>
                      <td class="px-4 py-3 text-sm">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          [class]="c.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'">
                          {{ c.status || 'active' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- Payroll Runs Tab -->
        @if (activeTab() === 'runs') {
          <!-- Filter row -->
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <select [(ngModel)]="runStatusFilter" (ngModelChange)="loadRuns()"
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>

          @if (runs().length === 0) {
            <div class="bg-gray-50 rounded-lg p-8 text-center">
              <p class="text-sm text-gray-500">No payroll runs found.</p>
            </div>
          } @else {
            <div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Employees</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Total</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (r of runs(); track r.id) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ r.clientName || '—' }}</td>
                      <td class="px-4 py-3 text-sm text-gray-600">{{ r.month || '—' }}</td>
                      <td class="px-4 py-3 text-sm">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          [ngClass]="{
                            'bg-gray-100 text-gray-700': r.status === 'DRAFT',
                            'bg-blue-100 text-blue-700': r.status === 'PROCESSING',
                            'bg-green-100 text-green-800': r.status === 'COMPLETED' || r.status === 'APPROVED',
                            'bg-amber-100 text-amber-700': r.status !== 'DRAFT' && r.status !== 'PROCESSING' && r.status !== 'COMPLETED' && r.status !== 'APPROVED'
                          }">
                          {{ r.status }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-sm text-right text-gray-600">{{ r.employeeCount | number }}</td>
                      <td class="px-4 py-3 text-sm text-right text-gray-600">{{ r.grossTotal | number:'1.0-0' }}</td>
                      <td class="px-4 py-3 text-sm text-gray-500">{{ r.createdAt | date:'mediumDate' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </main>
  `,
})
export class CrmPayrollStatusComponent implements OnInit, OnDestroy {
  private readonly base = `${environment.apiBaseUrl}/api/v1/payroll`;
  private readonly destroy$ = new Subject<void>();

  loading = signal(true);
  error = signal<string | null>(null);
  activeTab = signal<'clients' | 'runs'>('clients');

  summary = signal<PayrollSummary>({ assignedClients: 0, pendingRuns: 0, completedThisMonth: 0 });
  clients = signal<PayrollClient[]>([]);
  runs = signal<PayrollRun[]>([]);

  runStatusFilter = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set(null);

    // Load summary + clients in parallel
    this.http.get<any>(`${this.base}/summary`).pipe(takeUntil(this.destroy$)).subscribe({
      next: (r) => this.summary.set({
        assignedClients: Number(r?.assignedClients ?? 0),
        pendingRuns: Number(r?.pendingRuns ?? 0),
        completedThisMonth: Number(r?.completedThisMonth ?? 0),
      }),
      error: () => {},
    });

    this.http.get<any[]>(`${this.base}/clients`).pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => this.clients.set((list || []).map(c => ({
        id: c.id,
        clientName: c.clientName || c.client_name || c.name || 'Unknown',
        clientCode: c.clientCode || c.client_code || '',
        status: c.status || 'active',
      }))),
      error: () => {},
    });

    this.loadRuns();
  }

  loadRuns(): void {
    let params = new HttpParams();
    if (this.runStatusFilter) {
      params = params.set('status', this.runStatusFilter);
    }

    this.http.get<any>(`${this.base}/runs`, { params }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const items = res?.data || res?.items || res || [];
        this.runs.set((Array.isArray(items) ? items : []).map((r: any) => ({
          id: r.id,
          clientName: r.clientName || r.client_name || r.client?.clientName || '—',
          month: r.month || r.payrollMonth || '',
          status: r.status || 'DRAFT',
          employeeCount: Number(r.employeeCount ?? r.employee_count ?? 0),
          grossTotal: Number(r.grossTotal ?? r.gross_total ?? 0),
          createdAt: r.createdAt || r.created_at || '',
        })));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load payroll data. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
