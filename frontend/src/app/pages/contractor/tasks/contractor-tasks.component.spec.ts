import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ContractorTasksComponent } from './contractor-tasks.component';

describe('Contractor task links', () => {
  function setup(query: Record<string, string> = {}, id: string | null = null) {
    const queryParamMap = new BehaviorSubject(convertToParamMap(query));
    const paramMap = new BehaviorSubject(convertToParamMap(id ? { id } : {}));
    const route = {
      queryParamMap,
      paramMap,
      snapshot: { queryParamMap: queryParamMap.value, routeConfig: { path: 'tasks/:id' } },
    };
    const getMonthlyDocChecklist = vi.fn((month: string): Observable<any> => of({ month, items: [] }));
    const getContractorTasks = vi.fn((): Observable<any> => of([]));
    const contractorListAudits = vi.fn((): Observable<any> => of([]));
    type Args = ConstructorParameters<typeof ContractorTasksComponent>;
    const component = new ContractorTasksComponent(
      { getContractorTasks, contractorGetReuploadRequests: () => of([]) } as unknown as Args[0],
      { contractorListAudits } as unknown as Args[1],
      { getContractorBranches: () => of({ branches: [] }), getMonthlyDocChecklist } as unknown as Args[2],
      route as unknown as ActivatedRoute,
      { markForCheck: vi.fn() } as unknown as Args[4],
      { error: vi.fn() } as unknown as Args[5],
    );
    return { component, route, getMonthlyDocChecklist, queryParamMap, getContractorTasks, contractorListAudits };
  }

  it('loads the linked month and reloads when its query changes', () => {
    const { component, route, queryParamMap, getMonthlyDocChecklist } = setup({ month: '2025-12' });
    component.ngOnInit();
    expect(component.checklistYear).toBe(2025);
    expect(component.checklistMonth).toBe(12);
    expect(getMonthlyDocChecklist).toHaveBeenCalledExactlyOnceWith('2025-12', undefined);
    route.snapshot.queryParamMap = convertToParamMap({ month: '2026-01' });
    queryParamMap.next(route.snapshot.queryParamMap);
    expect(getMonthlyDocChecklist).toHaveBeenLastCalledWith('2026-01', undefined);
    expect(getMonthlyDocChecklist).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  });

  it('ignores invalid month parameters', () => {
    const { component, getMonthlyDocChecklist } = setup({ month: '2026-13' });
    const defaultMonth = component.checklistMonthParam;
    component.ngOnInit();
    expect(getMonthlyDocChecklist).toHaveBeenCalledExactlyOnceWith(defaultMonth, undefined);
    component.ngOnDestroy();
  });

  for (const type of ['REUPLOAD', 'TASK'] as const) {
    it(`selects the linked ${type} when IDs overlap`, () => {
      const { component } = setup(type === 'REUPLOAD' ? { type } : {}, '42');
      vi.spyOn(component, 'load').mockImplementation(() => {
        component.allRows = ['TASK', 'REUPLOAD'].map(rowType => ({
          id: '42', rowType, title: rowType, status: 'OPEN', dueDate: null,
          branchName: '-', clientName: '-',
        })) as typeof component.allRows;
        component.applyFilters();
        component['tryRestoreSelection']();
      });
      vi.spyOn(component, 'selectRow').mockImplementation(row => { component.selectedRow = row; });
      component.ngOnInit();
      expect(component.selectedRow?.rowType).toBe(type);
      expect(component.selectedRow?.id).toBe('42');
      component.ngOnDestroy();
    });
  }
  it('keeps tasks visible when audits fail and clears the warning after retry', () => {
    const { component, getContractorTasks, contractorListAudits } = setup();
    getContractorTasks.mockReturnValue(of([{ id: 't1', status: 'PENDING' }]));
    contractorListAudits.mockReturnValue(throwError(() => new Error('offline')));
    vi.spyOn(component, 'selectRow').mockImplementation(row => { component.selectedRow = row; });
    component.ngOnInit();
    expect(component.allRows.map(row => row.id)).toEqual(['t1']);
    expect(component.loadErrors).toEqual(['Audits']);
    expect(component.loading).toBe(false);
    contractorListAudits.mockReturnValue(of([]));
    component.load();
    expect(component.loadErrors).toEqual([]);
    expect(component.allRows.map(row => row.id)).toEqual(['t1']);
    component.ngOnDestroy();
  });

  it('retains previous task rows when their refresh fails', () => {
    const { component, getContractorTasks } = setup();
    getContractorTasks.mockReturnValue(of([{ id: 't1', status: 'PENDING' }]));
    vi.spyOn(component, 'selectRow').mockImplementation(row => { component.selectedRow = row; });
    component.ngOnInit();
    getContractorTasks.mockReturnValue(throwError(() => new Error('offline')));
    component.load();
    expect(component.allRows.map(row => row.id)).toEqual(['t1']);
    expect(component.loadErrors).toEqual(['Tasks']);
    component.ngOnDestroy();
  });

  it('cancels the previous checklist when month and branch change', () => {
    const { component, getMonthlyDocChecklist } = setup();
    const oldResponse = new Subject<any>();
    const newResponse = new Subject<any>();
    getMonthlyDocChecklist.mockReturnValueOnce(oldResponse).mockReturnValueOnce(newResponse);
    component.ngOnInit();
    component.checklistYear = 2026;
    component.checklistMonth = 8;
    component.checklistBranchId = 'b';
    component.reloadChecklist();
    expect(oldResponse.observed).toBe(false);
    expect(component.checklistLoading).toBe(true);
    expect(component.monthlyChecklist).toBeNull();
    const latest = { month: '2026-08', items: [] };
    newResponse.next(latest);
    newResponse.complete();
    oldResponse.next({ month: '2026-07', items: [{ id: 'stale' }] });
    oldResponse.complete();
    expect(component.monthlyChecklist).toBe(latest);
    expect(component.checklistLoading).toBe(false);
    expect(getMonthlyDocChecklist).toHaveBeenLastCalledWith('2026-08', 'b');
    component.ngOnDestroy();
  });

  it('shows checklist failures and recovers on retry', () => {
    const { component, getMonthlyDocChecklist } = setup();
    getMonthlyDocChecklist.mockReturnValueOnce(throwError(() => new Error('offline')));
    component.ngOnInit();
    expect(component.checklistError).toBe(true);
    expect(component.checklistLoading).toBe(false);
    component.reloadChecklist();
    expect(component.checklistError).toBe(false);
    expect(component.monthlyChecklist).not.toBeNull();
    component.ngOnDestroy();
  });
});
