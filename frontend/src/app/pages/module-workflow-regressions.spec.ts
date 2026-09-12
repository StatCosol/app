import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { SalesDashboardComponent } from './sales/sales-dashboard.component';
import { BillingPaymentsComponent } from '../modules/accounts-billing/pages/billing-payments.component';
import { EssLeaveComponent } from './ess/leave/ess-leave.component';
import { CcoDashboardComponent } from './cco/cco-dashboard.component';
import { PayrollDashboardComponent } from './payroll/payroll-dashboard.component';

describe('Module workflow regressions', () => {
  it('shows all 501 sales leads and waits for both dashboard requests', () => {
    const response = new Subject<any>();
    const c = new SalesDashboardComponent({ summary: () => response, myFollowups: () => of([]) } as any, {} as any);
    c.reload();
    expect(c.loading()).toBe(true);
    response.next({ stages: [{ stage: 'NEW', count: 501, value: '50100' }] });
    response.complete();
    expect(c.openLeadCount()).toBe(501);
    expect(c.newLeads()).toBe(501);
    expect(c.pipelineValue()).toContain('50,100');
    expect(c.loading()).toBe(false);
  });
  it('distinguishes a failed payment load from an empty result and retries', () => {
    const getAllPayments = vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of({ data: [], totalPages: 0 }));
    const c = new BillingPaymentsComponent({ getAllPayments } as any);
    c.load(); expect(c.loadError).toBe(true); expect(c.loading).toBe(false);
    c.load(); expect(c.loadError).toBe(false); expect(c.payments).toEqual([]);
  });
  it('marks leave data unavailable and preserves prior balances after failure', () => {
    const getLeavePolicies = vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of([]));
    const c = new EssLeaveComponent({ getLeaveBalances: () => of([]), getLeavePolicies, listLeaveApplications: () => of([]) } as any, { detectChanges: vi.fn() } as any, {} as any, {} as any);
    const balance = { leaveType: 'CL', balance: 8 } as any;
    c.balances = [balance];
    c.loadAll(); expect(c.loadError).toBe(true); expect(c.balances).toEqual([balance]);
    c.loadAll(); expect(c.loadError).toBe(false); expect(c.balances).toEqual([]);
  });
  it('hides CCO totals after a failed required widget and recovers on retry', () => {
    const getOversight = vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of([]));
    const c = new CcoDashboardComponent({ getDashboard: () => of({ totalClients: 10 }), getCrmsUnderMe: () => of([]), getOversight } as any, { detectChanges: vi.fn(), markForCheck: vi.fn() } as any, {} as any);
    const before = c.data;
    c.ngOnInit(); expect(c.dataUnavailable).toBe(true); expect(c.data).toBe(before);
    c.reload(); expect(c.dataUnavailable).toBe(false); expect(c.data).toEqual({ totalClients: 10 });
  });
  it('links a recent payroll run directly to its owning client', () => {
    const navigate = vi.fn();
    const c = new PayrollDashboardComponent({} as any, {} as any, { navigate } as any, {} as any);
    c.openRun({ id: 'run-b', clientId: 'client-b', periodYear: 2026, periodMonth: 8, status: 'DRAFT' });
    expect(navigate).toHaveBeenCalledWith(['/payroll/clients', 'client-b', 'runs'], { queryParams: { runId: 'run-b' } });
  });
});