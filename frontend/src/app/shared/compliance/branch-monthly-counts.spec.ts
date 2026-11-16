import '@angular/compiler';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BranchMcdComponent } from '../../pages/branch/branch-mcd/branch-mcd.component';

function setup(rows: any[] = []) {
  const api = { getChecklist: vi.fn(() => of({data: rows})), listBranchDocs: vi.fn(() => of({data: []})) };
  const c = new BranchMcdComponent(api as any, {} as any, {} as any, {} as any, {markForCheck:vi.fn()} as any, {} as any);
  c.branchId='TEST-B'; c.selectedYear=2026; c.selectedMonth=11; c.checklist=rows;
  return {c,api};
}
const row=(status?:string,file=true,extra:any={})=>({returnCode:'TEST-ROW',returnName:'Synthetic upload',uploadRequired:true,document:status?{status,uploadedFileUrl:file?'synthetic.pdf':null}:null,...extra});

describe('Branch monthly counters match required Client uploads',()=>{
  it('does not count six optional checklist rows as pending required uploads',()=>{
    const {c}=setup([...Array.from({length:40},()=>row()),...Array.from({length:6},()=>row(undefined,false,{uploadRequired:false}))]);
    expect([c.totalItems,c.uploadedCount,c.pendingCount,c.completenessPct]).toEqual([40,0,40,0]);
    expect(c.checklist).toHaveLength(46);
  });
  it('keeps returned and missing-file evidence pending, excluding optional and N/A rows',()=>{
    const {c}=setup([row('APPROVED'),row('SUBMITTED'),row('RESUBMITTED'),row('REUPLOAD_REQUIRED'),row('APPROVED',false),row(),row('NOT_APPLICABLE'),row('APPROVED',true,{uploadRequired:false})]);
    expect([c.totalItems,c.uploadedCount,c.pendingCount,c.returnedCount,c.approvedCount,c.completenessPct]).toEqual([6,3,3,1,1,50]);
    expect(c.monthCloseStatus).toBe('OPEN'); expect(c.monthCloseProgressPct).toBe(17);
  });
  it('does not close a month merely because an approved row lacks a file',()=>{
    const {c}=setup([row('APPROVED',false)]);
    expect(c.monthCloseStatus).toBe('OPEN');expect(c.completenessPct).toBe(0);
  });
  it('closes only required approved evidence and retains optional rows',()=>{
    const {c}=setup([row('APPROVED'),row('NOT_APPLICABLE'),row(undefined,false,{uploadRequired:false})]);
    expect([c.totalItems,c.approvedCount,c.completenessPct,c.monthCloseProgressPct]).toEqual([1,1,100,100]);
    expect(c.monthCloseStatus).toBe('CLOSED');expect(c.checklist).toHaveLength(3);
  });
  it('handles no required uploads without a misleading closed month',()=>{
    const {c}=setup([row('NOT_APPLICABLE'),row(undefined,false,{uploadRequired:false})]);
    expect([c.totalItems,c.pendingCount,c.completenessPct]).toEqual([0,0,0]);expect(c.monthCloseStatus).toBe('NO_ITEMS');
  });
  it('excludes optional and N/A rows from attention counters',()=>{
    const {c}=setup([row('OVERDUE',false),row('REUPLOAD_REQUIRED',true,{uploadRequired:false}),row('NOT_APPLICABLE',false,{dueDay:1})]);
    expect(c.overdueCount).toBe(1);expect(c.returnedCount).toBe(0);expect(c.pendingQueryCount).toBe(0);
  });
  it('requests actual evidence for both checklist and document reads',()=>{
    const {c,api}=setup();c.load();
    expect(api.getChecklist).toHaveBeenCalledWith({branchId:'TEST-B',year:2026,month:11,frequency:'MONTHLY',recordScope:'ACTUAL'});
    expect(api.listBranchDocs).toHaveBeenCalledWith(expect.objectContaining({recordScope:'ACTUAL',year:2026,month:11}));c.ngOnDestroy();
  });
});
