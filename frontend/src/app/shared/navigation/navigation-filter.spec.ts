import { describe, it, expect } from 'vitest';
import { filterNavigation } from './navigation-filter';
describe('Role menu search', () => {
  it('finds the workflow without changing permissions or original menu state', () => {
    const groups = [{ label: 'AuditXpert', expanded: false, items: [{ label: 'Assigned audits' },{ label: 'Corrections' }] },{ label: 'Insights', expanded: false, items: [{ label: 'Reports' }] }];
    expect(filterNavigation(groups,' corrections ')).toEqual([{ ...groups[0], expanded: true, items: [{ label: 'Corrections' }] }]);
    expect(groups[0].expanded).toBe(false); expect(filterNavigation(groups,'AuditXpert')[0].items.length).toBe(2);
    expect(filterNavigation(groups,'Payroll')).toEqual([]); expect(filterNavigation(groups,'')).toBe(groups);
  });
});
