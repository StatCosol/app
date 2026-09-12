import '@angular/compiler';
import { Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ContractorPayrollWorkflowComponent } from './contractor-payroll-workflow.component';

describe('Contractor payroll approval controls', () => {
  it('cancels previous scope requests and clears private notes on a scope change', () => {
    const old = new Subject<any>(),
      current = new Subject<any>();
    const get = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current);
    const c = new ContractorPayrollWorkflowComponent({ get } as any);
    c.clientId = 'client-one';
    c.periodMonth = '2026-09';
    c.ngOnChanges();
    c.notes['old-version'] = 'Private review';
    c.clientId = 'client-two';
    c.ngOnChanges();
    expect(old.observed).toBe(false);
    expect(c.notes).toEqual({});
    current.next({ data: [{ id: 'current' }] });
    old.next({ data: [{ id: 'old' }] });
    expect(c.versions()).toEqual([{ id: 'current' }]);
    c.ngOnDestroy();
    expect(current.observed).toBe(false);
  });
  it('sends the explicit review reason and reloads state after approval', () => {
    const post = vi.fn().mockReturnValue(of({})),
      get = vi.fn().mockReturnValue(of({ data: [] }));
    const c = new ContractorPayrollWorkflowComponent({ get, post } as any);
    c.notes['version'] = 'Reviewed approved attendance and wage rates';
    c.act({ id: 'version' }, 'approve');
    expect(post).toHaveBeenCalledWith(
      '/api/v1/contractor-payroll/versions/version/actions/approve',
      { reason: c.notes['version'] },
    );
    expect(get).toHaveBeenCalled();
    expect(c.busy()).toBe(false);
  });
  it('shows failures rather than treating them as an empty approval queue', () => {
    const request = new Subject<any>();
    const c = new ContractorPayrollWorkflowComponent({ get: () => request } as any);
    c.load();
    request.error({ error: { message: 'Payroll unavailable' } });
    expect(c.error()).toBe('Payroll unavailable');
    expect(c.busy()).toBe(false);
  });

  it('appends later pages without losing earlier versions', () => {
    const get = vi.fn().mockReturnValueOnce(of({data:[{id:'one'},{id:'two'}],hasMore:true})).mockReturnValueOnce(of({data:[{id:'three'}],hasMore:false}));
    const c = new ContractorPayrollWorkflowComponent({get} as any);
    c.load(); expect(c.hasMore()).toBe(true); c.load(true);
    expect(c.versions().map(v=>v.id)).toEqual(['one','two','three']);
    expect(get.mock.calls[1][1].params.offset).toBe('2'); expect(c.hasMore()).toBe(false);
  });
});
