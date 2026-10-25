import { describe,it,expect } from 'vitest';
import { activeNavigationItem, collapsedNavigationItems } from './active-navigation-item';
import { portalPagePurpose } from './portal-page-purpose';
describe('Current navigation destination',()=>{
  it('selects the most specific whole path and handles the app prefix and detail records',()=>{
    const items=[{route:'/client/attendance'},{route:'/client/attendance/daily'}];
    expect(activeNavigationItem('/app/client/attendance/daily/test?date=2026-10-01#top',items)).toBe(items[1]);
    expect(activeNavigationItem('/client/attendance-other',items)).toBeUndefined();
  });
  it('distinguishes contractor task and audit filters',()=>{
    const items=[{route:'/contractor/tasks'},{route:'/contractor/tasks',queryParams:{type:'AUDIT'}}];
    expect(activeNavigationItem('/app/contractor/tasks?type=AUDIT',items)).toBe(items[1]);
    expect(activeNavigationItem('/contractor/tasks/test?type=TASK',items)).toBe(items[0]);
    expect(activeNavigationItem('/contractor/tasks',items)).toBe(items[0]);
  });
  it('adds only the missing current item to collapsed shortcuts',()=>{
    const shortcuts=[{route:'/payroll/clients'}];
    const expanded=[...shortcuts,{route:'/payroll/clients/test/runs'}];
    const result=collapsedNavigationItems('/payroll/clients/test/runs',shortcuts,expanded);
    expect(result).toHaveLength(2);
    expect(activeNavigationItem('/payroll/clients/test/runs',result)).toBe(expanded[1]);
    expect(collapsedNavigationItems('/payroll/clients',shortcuts,expanded)).toHaveLength(1);
  });
  it('treats the unfiltered Tasks shortcut as the default task view without duplicating its label',()=>{
    const shortcuts=[{route:'/contractor/tasks',queryParams:{type:'TASK'}}];
    const expanded=[{route:'/contractor/tasks'},{route:'/contractor/tasks',queryParams:{type:'AUDIT'}}];
    expect(collapsedNavigationItems('/contractor/tasks',shortcuts,expanded)).toHaveLength(1);
    expect(collapsedNavigationItems('/contractor/tasks?type=AUDIT',shortcuts,expanded)).toHaveLength(2);
  });
  it('uses distinct guidance for contractor audits and payroll processing',()=>{
    expect(portalPagePurpose('/app/contractor/tasks?type=AUDIT')?.title).toContain('audit');
    expect(portalPagePurpose('/contractor/tasks')?.title).toContain('Compliance tasks');
    expect(portalPagePurpose('/app/payroll/clients/test/runs?month=12')?.title).toContain('payroll period');
    expect(portalPagePurpose('/payroll/clients/test/employees/id')?.title).toContain('Employee payroll');
    expect(portalPagePurpose('/client/unknown')).toBeUndefined();
  });
});
