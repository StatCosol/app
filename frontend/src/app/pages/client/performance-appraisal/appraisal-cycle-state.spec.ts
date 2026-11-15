import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ClientAppraisalCyclesComponent } from './client-appraisal-cycles.component';
import { BranchAppraisalCyclesComponent } from '../../branch/performance-appraisal/branch-appraisal-cycles.component';
const detector=()=>({markForCheck:vi.fn()});
const draft=()=>({cycleCode:'TEST-CYCLE',cycleName:'Synthetic cycle',financialYear:'2025-2026',appraisalType:'ANNUAL',reviewPeriodFrom:'2025-04-01',reviewPeriodTo:'2026-03-31'});
function client(){
 const create=new Subject<any>(),action=new Subject<any>(),reads:Subject<any>[]=[];
 const svc={getCycles:vi.fn(()=>{const s=new Subject<any>();reads.push(s);return s;}),createCycle:vi.fn((_payload:any)=>create),activateCycle:vi.fn(()=>action),closeCycle:vi.fn(()=>action),generateEmployees:vi.fn(()=>action)};
 const c:any=new ClientAppraisalCyclesComponent(svc as any,detector() as any);c.loading=false;c.newCycle=draft();c.cycles=[{id:'TEST-A',status:'ACTIVE',cycleName:'Synthetic A'},{id:'TEST-D',status:'DRAFT',cycleName:'Synthetic D'}];return{c,svc,create,action,reads};
}
describe('Appraisal cycle request safety',()=>{
 it('does not clear edits made while a cycle is being created',()=>{const f=client();f.c.showCreateForm=true;f.c.createCycle();f.c.newCycle.cycleName='Synthetic next draft';f.create.next({id:'TEST-CREATED'});f.create.complete();expect(f.c.newCycle.cycleName).toBe('Synthetic next draft');expect(f.c.showCreateForm).toBe(true);f.c.ngOnDestroy();});
 it('blocks duplicate create submissions',()=>{const f=client();f.c.createCycle();f.c.createCycle();expect(f.svc.createCycle).toHaveBeenCalledTimes(1);f.c.ngOnDestroy();});
 it('captures the creation payload before later form edits',()=>{const f=client();f.c.createCycle();f.c.newCycle.cycleName='Changed';expect(f.svc.createCycle.mock.calls[0][0].cycleName).toBe('Synthetic cycle');f.c.ngOnDestroy();});
 it('serializes generation and closing for the same cycle',()=>{const f=client();f.c.generateEmployees('TEST-A');f.c.closeCycle('TEST-A');expect(f.svc.closeCycle).not.toHaveBeenCalled();f.c.ngOnDestroy();});
 it('blocks duplicate generation clicks',()=>{const f=client();f.c.generateEmployees('TEST-A');f.c.generateEmployees('TEST-A');expect(f.svc.generateEmployees).toHaveBeenCalledTimes(1);f.c.ngOnDestroy();});
 it('does not offer generation for a draft cycle',()=>{const f=client();f.c.generateEmployees('TEST-D');expect(f.svc.generateEmployees).not.toHaveBeenCalled();f.c.ngOnDestroy();});
 it('keeps the newest list when an older refresh arrives last',()=>{const f=client();f.c.loadCycles();f.c.loadCycles();f.reads[1].next([{id:'NEW'}]);f.reads[1].complete();f.reads[0].next([{id:'OLD'}]);f.reads[0].complete();expect(f.c.cycles[0].id).toBe('NEW');f.c.ngOnDestroy();});
 it('keeps the latest request loading when an older one completes',()=>{const f=client();f.c.loadCycles();f.c.loadCycles();f.reads[0].complete();expect(f.c.loading).toBe(true);f.c.ngOnDestroy();});
});


describe('Cycle recovery',()=>{
 for(const kind of ['Client','Branch']){
  function fixture(){const reads:Subject<any>[]=[],cdr=detector(),svc={getCycles:()=>{const s=new Subject<any>();reads.push(s);return s;}};const c:any=kind==='Client'?new ClientAppraisalCyclesComponent(svc as any,cdr as any):new BranchAppraisalCyclesComponent(svc as any,cdr as any);return{c,reads,cdr};}
  it(kind+' shows unavailable counts and supports retry',()=>{const f=fixture();f.c.loadCycles();f.reads[0].error(Error('Synthetic outage'));expect(f.c.loadError).toBeTruthy();expect(f.c.loading).toBe(false);f.c.loadCycles();f.reads[1].next([]);f.reads[1].complete();expect(f.c.loadError).toBe('');expect(f.c.cycles).toEqual([]);f.c.ngOnDestroy();});
  it(kind+' ignores old failures',()=>{const f=fixture();f.c.loadCycles();f.c.loadCycles();f.reads[1].next([{id:'NEW'}]);f.reads[1].complete();f.reads[0].error(Error('Old outage'));expect(f.c.loadError).toBe('');expect(f.c.cycles[0].id).toBe('NEW');f.c.ngOnDestroy();});
  it(kind+' stops rendering after destruction',()=>{const f=fixture();f.c.loadCycles();f.c.ngOnDestroy();f.cdr.markForCheck.mockClear();f.reads[0].next([]);f.reads[0].complete();expect(f.cdr.markForCheck).not.toHaveBeenCalled();});
 }
 it('preserves failed create drafts and retries deliberately',()=>{const f=client();f.c.showCreateForm=true;f.c.createCycle();f.create.error(Error('Synthetic outage'));expect(f.c.newCycle).toEqual(draft());expect(f.c.creating).toBe(false);expect(f.c.actionError).toBeTruthy();const retry=new Subject<any>();f.svc.createCycle.mockReturnValue(retry);f.c.createCycle();retry.next({id:'NEW'});retry.complete();expect(f.c.showCreateForm).toBe(false);expect(f.c.actionError).toBe('');f.c.ngOnDestroy();});
 for(const invalid of [{cycleName:' '},{reviewPeriodFrom:'2026-04-01'},{reviewPeriodFrom:'2025-02-30'},{reviewPeriodTo:''}])it('rejects invalid input '+JSON.stringify(invalid),()=>{const f=client();Object.assign(f.c.newCycle,invalid);f.c.createCycle();expect(f.svc.createCycle).not.toHaveBeenCalled();expect(f.c.actionError).toBeTruthy();f.c.ngOnDestroy();});
 it('labels generation results and waits for refreshed counts before another action',()=>{const f=client();f.c.generateEmployees('TEST-A');f.action.next({generated:2,total:3,alreadyExisted:1});f.action.complete();expect(f.c.genCycleName).toBe('Synthetic A');expect(f.c.genResult.generated).toBe(2);expect(f.c.loading).toBe(true);f.c.closeCycle('TEST-A');expect(f.svc.closeCycle).not.toHaveBeenCalled();f.reads[0].next([{id:'TEST-A',status:'ACTIVE',eligibleCount:3}]);f.reads[0].complete();expect(f.c.cycles[0].eligibleCount).toBe(3);f.c.ngOnDestroy();});
 it('refreshes an action conflict before allowing retry',()=>{const f=client();f.c.activateCycle('TEST-D');f.action.error(Error('Conflict'));expect(f.c.actionError).toBeTruthy();expect(f.c.loading).toBe(true);f.c.activateCycle('TEST-D');expect(f.svc.activateCycle).toHaveBeenCalledTimes(1);f.reads[0].next([{id:'TEST-D',status:'ACTIVE'}]);f.reads[0].complete();f.c.activateCycle('TEST-D');expect(f.svc.activateCycle).toHaveBeenCalledTimes(1);f.c.ngOnDestroy();});
 it('preserves an unrelated create draft on list refresh',()=>{const f=client();f.c.showCreateForm=true;f.c.loadCycles();f.reads[0].next([]);f.reads[0].complete();expect(f.c.newCycle).toEqual(draft());expect(f.c.showCreateForm).toBe(true);f.c.ngOnDestroy();});
 it('blocks unknown cycles and actions after destruction',()=>{const f=client();f.c.activateCycle('UNKNOWN');f.c.ngOnDestroy();f.c.createCycle();f.c.generateEmployees('TEST-A');expect(f.svc.activateCycle).not.toHaveBeenCalled();expect(f.svc.createCycle).not.toHaveBeenCalled();expect(f.svc.generateEmployees).not.toHaveBeenCalled();});
});

