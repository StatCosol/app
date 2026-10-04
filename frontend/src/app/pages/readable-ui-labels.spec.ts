import { describe, expect, it, vi } from 'vitest';
import { Observable, of, Subject, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { BranchApprovalsApiService } from './client/approvals/branch-approvals-api.service';
import { CrmScopeFilterComponent } from '../shared/ui/crm-scope-filter/crm-scope-filter.component';
import { EmployeeSelectorComponent } from '../shared/ui/entity-selectors/employee-selector.component';
import { PayrollRunSelectorComponent } from '../shared/ui/entity-selectors/payroll-run-selector.component';
import { ContractorLoginSelectorComponent } from '../shared/ui/entity-selectors/contractor-login-selector.component';
import { ClientEmployeesService } from './client/employees/client-employees.service';

const cdr = { markForCheck: vi.fn() };

describe('Readable UI labels', () => {
  it.each(['listPendingLeaves', 'listPendingNominations'] as const)(
    'maps nested employee labels in %s without changing request identifiers',
    (method) => {
      const employeeId = 'f072a7a8-8888-4444-9999-000000000001';
      const http = {
        get: vi.fn((_url: string, _options: any) =>
          of([
            { id: 'request', employeeId, employee: { name: 'Allen', employeeCode: 'EMP001' } },
            { id: 'missing', employeeId, employee: null },
          ]),
        ),
      };
      const api = new BranchApprovalsApiService(http as any);
      let result: any[] = [];
      (api[method]('branch') as Observable<any[]>).subscribe((rows) => (result = rows));
      expect(result[0]).toMatchObject({
        id: 'request',
        employeeId,
        employeeName: 'Allen',
        employeeCode: 'EMP001',
      });
      expect(result[1].employeeName).toBeUndefined();
      expect(http.get.mock.calls[0][1].params.branchId).toBe('branch');
    },
  );

  it('resets a branch and discards stale branch responses when the client changes', () => {
    const first = new Subject<any[]>();
    const second = new Subject<any[]>();
    const api = { getBranchesForClient: vi.fn((id) => (id === 'first' ? first : second)) };
    const component = new CrmScopeFilterComponent(
      { getAssignedClients: () => of([]) } as any,
      api as any,
      cdr as any,
    );
    const changed = vi.fn();
    component.branchIdChange.subscribe(changed);
    component.ngOnInit();
    component.chooseClient('first');
    component.branchId = 'old-branch';
    component.chooseClient('second');
    second.next([{ id: 'new-branch', branchName: 'Hyderabad' }]);
    first.next([{ id: 'old-branch', branchName: 'Old branch' }]);
    expect(component.branchId).toBe('');
    expect(changed).toHaveBeenLastCalledWith('');
    expect(component.branches).toEqual([{ id: 'new-branch', label: 'Hyderabad' }]);
    component.ngOnDestroy();
  });

  it('cancels outdated payroll lists and retains the real run IDs', () => {
    const first = new Subject<any[]>();
    const second = new Subject<any[]>();
    const component = new PayrollRunSelectorComponent(
      { listRuns: ({ clientId }: any) => (clientId === 'first' ? first : second) } as any,
      cdr as any,
    );
    component.clientId = 'first';
    component.ngOnChanges();
    component.clientId = 'second';
    component.ngOnChanges();
    second.next([{ id: 'run-id', title: 'October interns', payrollCategory: 'INTERN' }]);
    first.next([{ id: 'wrong-client-run' }]);
    expect(component.runs).toEqual([
      { id: 'run-id', title: 'October interns', payrollCategory: 'INTERN' },
    ]);
    component.ngOnDestroy();
  });

  it('preserves an existing contractor login when its name is unavailable and filters other clients', () => {
    const component = new ContractorLoginSelectorComponent(
      {
        listMyContractors: () =>
          of([
            { id: 'mine', clientId: 'client', name: 'Contractor One' },
            { id: 'other', clientId: 'another', name: 'Other client contractor' },
          ]),
      } as any,
      cdr as any,
    );
    component.clientId = 'client';
    component.value = 'old-linked-id';
    component.ngOnChanges();
    expect(component.logins.map((row) => row.id)).toEqual(['mine']);
    expect(component.value).toBe('old-linked-id');
    expect(component.hasSelectedLogin()).toBe(false);
    component.ngOnDestroy();
  });

  it('renders employee names and codes while emitting the UUID only as the selection value', async () => {
    const id = 'f072a7a8-8888-4444-9999-000000000001';
    const list = vi.fn(() =>
      of({ data: [{ id, name: 'Allen', employeeCode: 'EMP001' }], total: 1 }),
    );
    await TestBed.configureTestingModule({
      imports: [EmployeeSelectorComponent],
      providers: [{ provide: ClientEmployeesService, useValue: { list } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(EmployeeSelectorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Allen — EMP001');
    expect(text).not.toContain(id);
    const selected = vi.fn();
    fixture.componentInstance.valueChange.subscribe(selected);
    const select = fixture.nativeElement.querySelector('select');
    select.value = id;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(selected).toHaveBeenCalledWith(id);
    // A failed search must not discard a previously selected employee.
    list.mockReturnValueOnce(throwError(() => new Error('offline')) as any);
    fixture.componentInstance.find();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Allen — EMP001');
    expect(fixture.nativeElement.textContent).toContain('could not be loaded');
    fixture.destroy();
  });
});
