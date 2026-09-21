import { of } from 'rxjs';
import { CrmQuotationComparisonComponent, groupBySkill } from './crm-quotation-comparison.component';

describe('Quotation comparison', () => {
  const row = (id: string, skill: string, billingTotal: number | null, hasBreakup = true) =>
    ({ quotationId: id, skillCategory: skill, billingTotal, hasBreakup });

  it('groups by skill in skill order and marks the lowest billing', () => {
    const groups = groupBySkill([
      row('s1', 'SKILLED', 27611.48), row('u1', 'UNSKILLED', 22197.91),
      row('u2', 'UNSKILLED', 20462.91), row('u3', 'UNSKILLED', null, false),
      row('s2', 'SKILLED', 25012.4),
    ]);
    expect(groups.map((g) => g.skill)).toEqual(['UNSKILLED', 'SKILLED']);
    expect(groups[0].lowestId).toBe('u2');
    expect(groups[1].lowestId).toBe('s2');
  });

  it('marks nothing when a skill has a single priced quotation', () => {
    expect(groupBySkill([row('u1', 'UNSKILLED', 20000), row('u2', 'UNSKILLED', null, false)])[0].lowestId).toBeNull();
  });

  it('asks for the selected site and keeps every site offered while one is chosen', () => {
    const get = vi.fn(() => of({ payDays: 26, branches: [{ id: 'b1', name: 'Plant' }], rows: [row('u1', 'UNSKILLED', 1)] }));
    const c = new CrmQuotationComparisonComponent({ get } as any, {} as any, {} as any);
    c.clientId = 'c1'; c.onDate = '2026-09-01'; c.load();
    expect(c.branches.length).toBe(1);
    c.branchId = 'b1'; c.skill = 'UNSKILLED';
    get.mockReturnValueOnce(of({ payDays: 26, branches: [], rows: [] }));
    c.load();
    expect(get).toHaveBeenLastCalledWith(expect.stringContaining('/quotations/comparison'), {
      params: { clientId: 'c1', onDate: '2026-09-01', branchId: 'b1', skillCategory: 'UNSKILLED' },
    });
    expect(c.branches.length).toBe(1);
    c.ngOnDestroy();
  });
});
