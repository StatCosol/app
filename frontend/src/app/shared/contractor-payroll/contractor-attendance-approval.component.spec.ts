import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { ContractorAttendanceApprovalComponent } from './contractor-attendance-approval.component';

function setup(user: any) {
  const http = {
    get: vi.fn().mockReturnValue(of({ data: [] })),
    post: vi.fn().mockReturnValue(of({})),
  };
  const component = new ContractorAttendanceApprovalComponent(
    http as any,
    { getUser: () => user } as any,
  );
  component.periodMonth = '2026-09';
  return { component, http };
}
describe('contractor attendance review UI', () => {
  it('hides attendance actions from master client users and auditors', () => {
    for (const roleCode of ['CLIENT', 'AUDITOR', 'CRM']) {
      const { component, http } = setup({ roleCode, userType: 'MASTER' });
      component.load();
      expect(component.visible).toBe(false);
      expect(http.get).not.toHaveBeenCalled();
    }
  });
  it('shows the queue to branch-scoped client users', () => {
    const { component } = setup({ roleCode: 'CLIENT', userType: 'BRANCH' });
    expect(component.visible).toBe(true);
  });
  it('discards a previous month request when the selected period changes', () => {
    const { component, http } = setup({ roleCode: 'BRANCH_DESK' });
    const old = new Subject<any>(),
      current = new Subject<any>();
    http.get.mockReturnValueOnce(old).mockReturnValueOnce(current);
    component.load();
    component.periodMonth = '2026-10';
    component.ngOnChanges();
    current.next({ data: [{ id: 'october' }] });
    old.next({ data: [{ id: 'september' }] });
    expect(component.batches()).toEqual([{ id: 'october' }]);
    component.ngOnDestroy();
  });
  it('sends branch remarks with the decision', () => {
    const { component, http } = setup({ roleCode: 'BRANCH_DESK' });
    component.batches.set([
      { id: 'batch', rows_snapshot: [{ employee_code: 'G001', days_worked: 28, ot_hours: 2 }] },
    ]);
    component.notes['batch'] = 'Verified against shifts';
    component.review('batch', 'approve');
    expect(http.post).toHaveBeenCalledWith('/api/v1/contractor-attendance/batch/review', {
      decision: 'approve',
      remarks: 'Verified against shifts',
      rows: [{ employee_code: 'G001', days_worked: 28, ot_hours: 2 }],
    });
  });
  it('surfaces a calculation failure without pretending approval succeeded', () => {
    const { component, http } = setup({ roleCode: 'BRANCH_DESK' });
    http.post.mockReturnValueOnce(
      throwError(() => ({ error: { message: 'Employee deployment changed' } })),
    );
    component.review('batch', 'approve');
    expect(component.error()).toBe('Employee deployment changed');
    expect(component.busy()).toBe(false);
  });
});

it('loads the next page without discarding earlier attendance', () => {
  const { component, http } = setup({ roleCode: 'BRANCH_DESK' });
  http.get
    .mockReturnValueOnce(of({ data: [{ id: 'first' }], hasMore: true }))
    .mockReturnValueOnce(of({ data: [{ id: 'second' }], hasMore: false }));
  component.load();
  expect(component.hasMore()).toBe(true);
  component.load(true);
  expect(http.get.mock.calls[1][1].params.offset).toBe(1);
  expect(component.batches().map((b) => b.id)).toEqual(['first', 'second']);
  expect(component.hasMore()).toBe(false);
});
