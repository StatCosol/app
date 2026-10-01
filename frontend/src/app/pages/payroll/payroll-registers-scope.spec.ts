import { BehaviorSubject, Subject, of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { PayrollRegistersComponent } from './payroll-registers.component';

describe('Payroll register client and period refresh', () => {
  const components: PayrollRegistersComponent[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { components.forEach(c => c.ngOnDestroy()); components.length = 0; vi.useRealTimers(); });

  function setup(options: { runs?: any; list?: any; branches?: any } = {}) {
    const paramMap = new BehaviorSubject(convertToParamMap({ clientId: 'logiq' }));
    const listRegisters = options.list || vi.fn(() => of([]));
    const getPayrollRuns = options.runs || vi.fn(() => of([]));
    const getOptionBranches = options.branches || vi.fn((clientId: string) => of([{ id: clientId + '-branch', branchName: 'BRM' }]));
    const c = new PayrollRegistersComponent(
      { getAssignedClients: () => of([]), getOptionBranches } as any,
      { listRegisters, getPayrollRuns } as any,
      { markForCheck: vi.fn() } as any, {} as any,
      { snapshot: { paramMap: paramMap.value }, paramMap } as any);
    components.push(c); c.ngOnInit();
    return { c, paramMap, listRegisters, getPayrollRuns, getOptionBranches };
  }

  it('refreshes a reused client route and clears stale branch, register and builder scope', () => {
    const { c, paramMap, listRegisters, getPayrollRuns, getOptionBranches } = setup();
    vi.advanceTimersByTime(150);
    c.genBranchId = 'logiq-branch'; c.filterAct = 'OLD'; c.filterRegisterType = 'OLD_FORM'; c.registerBuilderOpen = true;
    paramMap.next(convertToParamMap({ clientId: 'another-client' }));
    vi.advanceTimersByTime(150);
    expect(c.q.clientId).toBe('another-client');
    expect(c.genBranchId).toBe(''); expect(c.filterAct).toBe(''); expect(c.filterRegisterType).toBe('');
    expect(c.registerBuilderOpen).toBe(false); expect(c.genBranches[0].id).toBe('another-client-branch');
    expect(getPayrollRuns).toHaveBeenLastCalledWith('another-client');
    expect(getOptionBranches).toHaveBeenLastCalledWith('another-client');
    expect(listRegisters).toHaveBeenLastCalledWith(expect.objectContaining({ clientId: 'another-client', branchId: undefined }));
  });

  it('matches an approved company-wide run after asynchronous options load, within the selected client', () => {
    const pendingRuns = new Subject<any>();
    const { c } = setup({ runs: vi.fn(() => pendingRuns) });
    c.genBranchId = 'logiq-branch'; c.selYear = 2026; c.selMonth = 3; c.onPeriodChange();
    expect(c.matchedRun).toBe(null);
    pendingRuns.next([
      { id: 'other', clientId: 'other', branchId: null, status: 'APPROVED', periodYear: 2026, periodMonth: 3 },
      { id: 'draft', clientId: 'logiq', branchId: null, status: 'DRAFT', periodYear: 2026, periodMonth: 3 },
      { id: 'approved', clientId: 'logiq', branchId: null, status: 'APPROVED', periodYear: 2026, periodMonth: 3 },
    ]); pendingRuns.complete();
    expect(c.matchedRun?.id).toBe('approved'); expect(c.canGenerate).toBe(true);
    c.selMonth = 4; c.onPeriodChange(); expect(c.matchedRun).toBe(null);
  });

  it('cancels the initial request immediately when filters change and loads the newest period', () => {
    const initial = new Subject<any>(), latest = new Subject<any>();
    const list = vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(latest);
    const { c, listRegisters } = setup({ list });
    vi.advanceTimersByTime(150); expect(c.loading).toBe(true);
    c.selYear = 2026; c.selMonth = 3; c.onPeriodChange();
    initial.next([{ id: 'stale' }]); expect(c.rows).toEqual([]);
    vi.advanceTimersByTime(150); expect(c.loading).toBe(true);
    expect(listRegisters).toHaveBeenLastCalledWith(expect.objectContaining({ periodYear: 2026, periodMonth: 3 }));
    latest.next([{ id: 'march' }]); latest.complete();
    expect(c.rows.map(r => r.id)).toEqual(['march']); expect(c.loading).toBe(false);
  });

  it('cancels old client option requests before they can overwrite the new scope', () => {
    const oldRuns = new Subject<any>(), oldBranches = new Subject<any>();
    const { c, paramMap } = setup({
      runs: vi.fn().mockReturnValueOnce(oldRuns).mockReturnValue(of([])),
      branches: vi.fn().mockReturnValueOnce(oldBranches).mockReturnValue(of([{ id: 'new-branch' }])),
    });
    paramMap.next(convertToParamMap({ clientId: 'another-client' }));
    oldBranches.next([{ id: 'old-branch' }]); oldBranches.complete();
    oldRuns.next([{ id: 'old-run' }]); oldRuns.complete();
    expect(c.genBranches.map(b => b.id)).toEqual(['new-branch']); expect(c.allRuns).toEqual([]);
  });
});
