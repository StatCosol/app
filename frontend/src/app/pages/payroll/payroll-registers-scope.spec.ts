import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
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
      { id: 'other', clientId: 'other', branchId: null, status: 'APPROVED', approvedAt: '2026-04-01', periodYear: 2026, periodMonth: 3 },
      { id: 'draft', clientId: 'logiq', branchId: null, status: 'DRAFT', periodYear: 2026, periodMonth: 3 },
      { id: 'approved', clientId: 'logiq', branchId: null, status: 'APPROVED', approvedAt: '2026-04-01', periodYear: 2026, periodMonth: 3 },
    ]); pendingRuns.complete();
    expect(c.matchedRun?.id).toBe('approved'); expect(c.canGenerate).toBe(true);
    c.selMonth = 4; c.onPeriodChange(); expect(c.matchedRun).toBe(null);
  });

  it('requires an explicit choice between matching approved runs and rejects other branches', () => {
    const make = (id: string, branchId: string | null) => ({ id, branchId, clientId: 'logiq', status: 'APPROVED', approvedAt: '2026-04-01', periodYear: 2026, periodMonth: 3 });
    const { c } = setup({ runs: vi.fn(() => of([make('other', 'another-branch'), make('branch', 'logiq-branch'), make('whole-client', null)])) });
    c.genBranchId = 'logiq-branch'; c.selYear = 2026; c.selMonth = 3; c.onPeriodChange();
    expect(c.payrollRunOptions.map(r => r.id)).toEqual(['branch', 'whole-client']);
    expect(c.matchedRun).toBeNull();
    c.selectedRunId = 'branch'; c.selectRun(); expect(c.matchedRun?.id).toBe('branch');
    c.selectedRunId = 'other'; c.selectRun(); expect(c.matchedRun).toBeNull();
    c.genBranchId = 'another-branch'; c.onBranchChange(); expect(c.selectedRunId).toBe('');
  });
  it('refreshes newly approved source runs without navigating away and keeps branch scope', () => {
    const getRuns = vi.fn().mockReturnValueOnce(of([])).mockReturnValueOnce(of([{ id: 'newly-approved', clientId: 'logiq', branchId: 'logiq-branch', status: 'APPROVED', approvedAt: '2026-04-01', periodYear: 2026, periodMonth: 3 }]));
    const { c } = setup({ runs: getRuns });
    c.genBranchId = 'logiq-branch'; c.selYear = 2026; c.selMonth = 3; c.onPeriodChange();
    expect(c.matchedRun).toBeNull();
    c.refresh();
    expect(c.matchedRun?.id).toBe('newly-approved');
    expect(c.genBranchId).toBe('logiq-branch');
    expect(getRuns).toHaveBeenCalledTimes(2);
  });
  it('does not treat an omitted branch scope or missing approval timestamp as a company-wide source', () => {
    const { c } = setup({ runs: vi.fn(() => of([
      { id: 'omitted', clientId: 'logiq', status: 'APPROVED', approvedAt: '2026-04-01', periodYear: 2026, periodMonth: 3 },
      { id: 'no-approval', clientId: 'logiq', branchId: null, status: 'APPROVED', periodYear: 2026, periodMonth: 3 },
    ])) });
    c.genBranchId = 'logiq-branch'; c.selYear = 2026; c.selMonth = 3; c.onPeriodChange();
    expect(c.payrollRunOptions).toEqual([]); expect(c.matchedRun).toBeNull();
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

  it('keeps branch choices when payroll runs fail and preserves the warning after register loading', () => {
    const { c, paramMap } = setup({ runs: vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValue(of([])) });
    expect(c.genBranches.map(b => b.id)).toEqual(['logiq-branch']);
    expect(c.allRuns).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(c.optionsError).toContain('Payroll runs could not be loaded');
    paramMap.next(convertToParamMap({ clientId: 'another-client' }));
    expect(c.optionsError).toBe('');
  });

  it('keeps approved payroll runs when branch options fail', () => {
    const { c } = setup({
      branches: vi.fn(() => throwError(() => new Error('offline'))),
      runs: vi.fn(() => of([{ id: 'approved', clientId: 'logiq', branchId: null, status: 'APPROVED', approvedAt: '2026-04-01', periodYear: 2026, periodMonth: 3 }])),
    });
    expect(c.genBranches).toEqual([]);
    expect(c.allRuns.map(r => r.id)).toEqual(['approved']);
    expect(c.optionsError).toContain('Branch options could not be loaded');
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

describe('Saved statutory format selection and transfer', () => {
  const saved = [
    { id: 'wages', registerType: 'LEGAL_wages', legalIdentity: { actCode: 'WAGES_2019', label: 'AP · Form IV · Wages' } },
    { id: 'shops', registerType: 'LEGAL_shops', legalIdentity: { actCode: 'TS_SHOPS_1988', label: 'TS · Form II + III · Integrated register' } },
    { id: 'accident', registerType: 'ACCIDENT_REGISTER' },
  ] as any;
  function setup() {
    const downloadRegistersPack = vi.fn(() => of(new Blob(['zip'])));
    const saveBlob = vi.fn();
    const c = new PayrollRegistersComponent({} as any,
      { listRegisters: () => of(saved), downloadRegistersPack, saveBlob } as any,
      { markForCheck: vi.fn() } as any, {} as any, {} as any);
    return { c, downloadRegistersPack };
  }
  it('offers exact saved legal forms and event registers in their Act menu', () => {
    const { c } = setup(); c.savedRows = saved;
    c.filterAct = 'SHOPS_ESTABLISHMENTS';
    expect(c.filteredRegisterTypes).toContainEqual(expect.objectContaining({ value: 'LEGAL_shops', label: expect.stringContaining('II + III') }));
    expect(c.filteredRegisterTypes.map(r => r.value)).not.toContain('LEGAL_wages');
    c.filterAct = 'FACTORIES_ACT';
    expect(c.filteredRegisterTypes.map(r => r.value)).toContain('ACCIDENT_REGISTER');
  });
  it('downloads only the displayed Act records in the chosen branch and month', () => {
    const { c, downloadRegistersPack } = setup();
    c.q.clientId = 'logiq'; c.genBranchId = 'brm'; c.selYear = 2026; c.selMonth = 3;
    c.filterAct = 'SHOPS_ESTABLISHMENTS';
    (c as any).fetchRegisters$().subscribe((rows: any) => c.rows = rows);
    expect(c.rows.map(r => r.id)).toEqual(['shops']);
    expect(c.savedRows).toHaveLength(3);
    c.downloadAll();
    expect(downloadRegistersPack).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'logiq', branchId: 'brm', periodYear: 2026, periodMonth: 3, registerIds: ['shops'],
    }));
    c.filterRegisterType = 'LEGAL_shops';
    (c as any).fetchRegisters$().subscribe((rows: any) => c.rows = rows);
    expect(c.rows.map(r => r.id)).toEqual(['shops']); expect(c.savedRows).toHaveLength(3);
  });
  it('opens December for an annual register and ignores stale branch events', () => {
    const { c } = setup();
    c.genBranchId = 'brm'; c.selYear = 2026; c.selMonth = 3;
    c.onRegisterGenerated({ branchId: 'another', year: 2025, month: 12 });
    expect(c.selMonth).toBe(3); expect(c.selYear).toBe(2026);
    c.onRegisterGenerated({ branchId: 'brm', year: 2026, month: 12 });
    expect(c.selMonth).toBe(12); expect(c.selYear).toBe(2026);
  });
  it('clears obsolete form filters after generation and blocks stale or oversized ZIP downloads', () => {
    const { c, downloadRegistersPack } = setup();
    c.rows = saved; c.loading = true; c.downloadAll(); expect(downloadRegistersPack).not.toHaveBeenCalled();
    c.loading = false; c.rows = Array(301).fill(saved[0]); c.downloadAll();
    expect(downloadRegistersPack).not.toHaveBeenCalled(); expect(c.error).toContain('300');
    c.filterAct = 'OLD_ACT'; c.filterRegisterType = 'OLD_FORM'; c.onRegisterGenerated();
    expect(c.filterAct).toBe(''); expect(c.filterRegisterType).toBe(''); expect(c.rows).toEqual([]);
  });
});
