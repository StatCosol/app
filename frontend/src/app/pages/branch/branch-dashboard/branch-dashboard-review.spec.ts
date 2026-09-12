import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { BranchDashboardComponent } from './branch-dashboard.component';

describe('Branch dashboard request lifecycle',()=>{
  it('cancels old task requests when branch or month changes',()=>{
    const summaries=[new Subject<any>(),new Subject<any>(),new Subject<any>()];
    const items=[new Subject<any>(),new Subject<any>(),new Subject<any>()];
    let si=0,ti=0;
    const getMySummary=vi.fn(()=>summaries[si++]); const getMyItems=vi.fn(()=>items[ti++]);
    const c=new BranchDashboardComponent({markForCheck:vi.fn()} as any,{} as any,{} as any,{getUser:()=>({id:'u'}),hasModule:()=>false} as any,{} as any,{getMySummary,getMyItems} as any);
    c.currentMonth='2026-09';c.branchId='b1';c.loadDashboard();
    expect(summaries[0].observed).toBe(true);expect(items[0].observed).toBe(true);
    c.branchId='b2';c.loadDashboard();
    expect(summaries[0].observed).toBe(false);expect(items[0].observed).toBe(false);
    const fresh={open:2,overdue:1,total:2,dueSoon:0};
    summaries[1].next(fresh);summaries[1].complete();items[1].next([{id:'fresh'}]);items[1].complete();
    summaries[0].next({open:99});items[0].next([{id:'stale'}]);
    expect(c.taskSummary).toEqual(fresh);expect(c.pendingTasks[0].id).toBe('fresh');
    c.currentMonth='2026-10';c.branchId='';c.loadDashboard();
    expect(getMyItems).toHaveBeenLastCalledWith(expect.objectContaining({branchId:undefined}));
    c.ngOnDestroy();expect(summaries[2].observed).toBe(false);expect(items[2].observed).toBe(false);
  });
});