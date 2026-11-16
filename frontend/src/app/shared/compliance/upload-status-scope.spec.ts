import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BranchComplianceComponent } from './branch-compliance.component';
function setup() {
  const schedules: Subject<any>[] = [], docs: Subject<any>[] = [], risks: Subject<any>[] = [], actions: Subject<any>[] = [];
  const request = (a: Subject<any>[]) => { const s = new Subject<any>(); a.push(s); return s; };
  const api = { getBranchComplianceItems: vi.fn(() => request(schedules)), getRiskScore: vi.fn(() => request(risks)), getActionPlan: vi.fn(() => request(actions)) };
  const documents = { getChecklist: vi.fn(() => request(docs)) };
  const c = new BranchComplianceComponent(api as any, documents as any, {getBranchIds:()=>[]} as any, {} as any, {markForCheck:vi.fn()} as any);
  c.branchId='TEST-B1';c.month='2026-11';
  return {c,api,documents,schedules,docs,risks,actions};
}
const row=(status?:string,file=true,extra:any={})=>({returnCode:'TEST-ROW',uploadRequired:true,document:status?{status,uploadedFileUrl:file?'local-synthetic.pdf':null}:null,...extra});
function complete(s:Subject<any>,data:any){s.next(data);s.complete();}
describe('Monthly Upload Status scope',()=>{
  it('requests the selected branch/month actual checklist, never the unscoped summary',()=>{
    const f=setup();f.c.load();expect(f.documents.getChecklist).toHaveBeenCalledWith({branchId:'TEST-B1',year:2026,month:11,frequency:'MONTHLY',recordScope:'ACTUAL'});
  });
  it('keeps 3 schedule obligations separate from 52 monthly uploads',()=>{
    const f=setup();f.c.load();complete(f.schedules[0],{items:[{code:'A',module:'RETURNS'},{code:'B',module:'RETURNS'},{code:'C',module:'MCD'}]});
    complete(f.docs[0],{data:Array.from({length:52},()=>row())});
    expect([f.c.total,f.c.totalApplicableCodes,f.c.completedCount,f.c.pendingCount,f.c.completionPercent]).toEqual([3,52,0,52,0]);
  });
  it('partitions required uploads without treating returns or missing files as complete',()=>{
    const f=setup();f.c.load();complete(f.docs[0],{data:[row('APPROVED'),row('SUBMITTED'),row('RESUBMITTED'),row('REUPLOAD_REQUIRED'),row('APPROVED',false),row(),row('NOT_APPLICABLE'),row(undefined,true,{uploadRequired:false})]});
    expect([f.c.totalApplicableCodes,f.c.completedCount,f.c.pendingCount,f.c.completionPercent]).toEqual([6,3,3,50]);
  });
  for(const field of ['branchId','month','module'] as const)it('cancels outdated '+field+' results',()=>{
    const f=setup();f.c.load();if(field==='branchId')f.c.branchId='TEST-B2';else if(field==='month')f.c.month='2026-10';else f.c.module='MCD';f.c.load();
    complete(f.docs[1],{data:[row('APPROVED')]});complete(f.schedules[1],{items:[{code:'CURRENT',module:'MCD'}]});
    complete(f.docs[0],{data:Array.from({length:52},()=>row())});complete(f.schedules[0],{items:[{code:'OLD'}]});f.risks[0].next({items:[{branchId:'TEST-B1',riskLevel:'HIGH'}]});
    expect(f.c.totalApplicableCodes).toBe(1);expect(f.c.items[0].code).toBe('CURRENT');expect(f.actions).toHaveLength(0);
  });
  it('clears counts and old details immediately on refresh',()=>{
    const f=setup();f.c.load();complete(f.docs[0],{data:[row('APPROVED')]});f.c.actionPlan=[{text:'old'}];f.c.load();
    expect(f.c.completionReady).toBe(false);expect(f.c.completionLoading).toBe(true);expect(f.c.items).toEqual([]);expect(f.c.actionPlan).toEqual([]);
  });
  for(const response of [null,{}, {data:null}])it('does not report malformed data as zero',()=>{
    const f=setup();f.c.load();complete(f.docs[0],response);expect(f.c.completionReady).toBe(false);expect(f.c.completionError).toContain('unavailable');
  });
  it('keeps schedule available during upload outage and retries in the same scope',()=>{
    const f=setup();f.c.load();complete(f.schedules[0],{items:[{code:'A',module:'RETURNS'}]});f.docs[0].error(Error('test'));
    expect(f.c.items).toHaveLength(1);expect(f.c.completionReady).toBe(false);f.c.load();complete(f.docs[1],{data:[]});
    expect(f.c.completionReady).toBe(true);expect(f.c.completionError).toBe('');expect(f.c.totalApplicableCodes).toBe(0);
  });
  it('does not erase upload totals when schedule fails',()=>{
    const f=setup();f.c.load();complete(f.docs[0],{data:[row()]});f.schedules[0].error(Error('test'));expect(f.c.completionReady).toBe(true);expect(f.c.errorMessage).toContain('Schedule');
  });
  it('filters schedule totals with the visible module without changing monthly counts',()=>{
    const f=setup();f.c.module='MCD';f.c.load();complete(f.schedules[0],{items:[{module:'RETURNS'},{module:'MCD'}]});complete(f.docs[0],{data:[row(),row()]});
    expect([f.c.total,f.c.mcdCount,f.c.returnsCount,f.c.totalApplicableCodes]).toEqual([1,1,0,2]);
  });
  it('ignores previous action plans after switching scope',()=>{
    const f=setup();f.c.load();f.risks[0].next({items:[{branchId:'TEST-B1',riskLevel:'HIGH'}]});f.c.month='2026-10';f.c.load();f.actions[0].next({actions:[{text:'old'}]});expect(f.c.actionPlan).toEqual([]);
  });
  it('invalid and cleared selection cancel reads and do not broaden scope',()=>{
    const f=setup();f.c.load();f.c.branchId='';f.c.load();expect(f.docs[0].observed).toBe(false);expect(f.docs).toHaveLength(1);expect(f.c.errorMessage).toContain('Select');
  });
  it('cancels pending reads when leaving',()=>{
    const f=setup();f.c.load();f.c.ngOnDestroy();expect([...f.schedules,...f.docs,...f.risks].every(s=>!s.observed)).toBe(true);
  });
});
