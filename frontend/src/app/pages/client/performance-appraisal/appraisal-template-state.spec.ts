import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ClientAppraisalTemplatesComponent } from './client-appraisal-templates.component';
function fixture(){
 const reads:Subject<any>[]=[];const save=new Subject<any>();const cdr={markForCheck:vi.fn()};
 const svc={getTemplates:vi.fn(()=>{const s=new Subject<any>();reads.push(s);return s;}),createTemplate:vi.fn((_payload:any)=>save)};
 const c:any=new ClientAppraisalTemplatesComponent(svc as any,cdr as any);c.draft={templateCode:'TEST-TEMPLATE',templateName:'Synthetic rating'};c.showCreate=true;
 return{c,svc,save,reads,cdr};
}
describe('Appraisal template recovery',()=>{
 it('preserves a newer draft when creation completes',()=>{const f=fixture();f.c.createTemplate();f.c.draft.templateName='Synthetic next';f.save.next({id:'TEST-NEW'});f.save.complete();expect(f.c.draft.templateName).toBe('Synthetic next');expect(f.c.showCreate).toBe(true);});
 it('blocks repeated create requests while pending',()=>{const f=fixture();f.c.createTemplate();f.c.createTemplate();expect(f.svc.createTemplate).toHaveBeenCalledTimes(1);});
 it('shows a retryable list error instead of an empty result',()=>{const f=fixture();f.c.reload();f.reads[0].error(Error('Synthetic outage'));expect(f.c.loadError).toBeTruthy();});
 it('ignores an older list response',()=>{const f=fixture();f.c.reload();f.c.reload();f.reads[1].next([{id:'TEST-NEW'}]);f.reads[1].complete();f.reads[0].next([{id:'TEST-OLD'}]);f.reads[0].complete();expect(f.c.templates[0].id).toBe('TEST-NEW');});
 it('keeps the current read loading when an older one completes',()=>{const f=fixture();f.c.reload();f.c.reload();f.reads[0].complete();expect(f.c.loading).toBe(true);});
});
describe('Template recovery follow-up cases',()=>{
 it('keeps the draft and shows create failures',()=>{const f=fixture();f.c.createTemplate();f.save.error(Error('Synthetic failure'));expect(f.c.createError).toBeTruthy();expect(f.c.creating).toBe(false);expect(f.c.draft.templateCode).toBe('TEST-TEMPLATE');expect(f.c.showCreate).toBe(true);});
 it('retries failed reads and clears the unavailable state',()=>{const f=fixture();f.c.reload();f.reads[0].error(Error('Synthetic failure'));f.c.reload();f.reads[1].next([]);f.reads[1].complete();expect(f.c.loadError).toBe('');expect(f.c.loading).toBe(false);});
 it('ignores old read failures',()=>{const f=fixture();f.c.reload();f.c.reload();f.reads[1].next([{id:'TEST-NEW'}]);f.reads[1].complete();f.reads[0].error(Error('Old failure'));expect(f.c.loadError).toBe('');expect(f.c.templates[0].id).toBe('TEST-NEW');});
 it('clears only the successfully saved unchanged draft',()=>{const f=fixture();f.c.createTemplate();f.save.next({id:'TEST-NEW'});f.save.complete();expect(f.c.showCreate).toBe(false);expect(f.c.draft).toEqual({templateCode:'',templateName:''});expect(f.c.createMessage).toBe('Template created.');});
 it('captures trimmed submitted values independently of later edits',()=>{const f=fixture();f.c.draft.templateCode=' TEST-TEMPLATE ';f.c.createTemplate();f.c.draft.templateCode='TEST-NEXT';expect(f.svc.createTemplate.mock.calls[0][0]).toEqual({templateCode:'TEST-TEMPLATE',templateName:'Synthetic rating',sections:[]});});
 it('does not destroy a draft during a list refresh',()=>{const f=fixture();f.c.reload();f.reads[0].next([]);f.reads[0].complete();expect(f.c.draft.templateName).toBe('Synthetic rating');expect(f.c.showCreate).toBe(true);});
 it('shows required input errors without submitting',()=>{const f=fixture();f.c.draft.templateName=' ';f.c.createTemplate();expect(f.svc.createTemplate).not.toHaveBeenCalled();expect(f.c.createError).toContain('code and name');});
 it('stops reads and writes from updating a destroyed screen',()=>{const f=fixture();f.c.reload();f.c.createTemplate();f.c.ngOnDestroy();f.cdr.markForCheck.mockClear();f.save.next({id:'TEST-NEW'});f.reads[0].next([]);expect(f.cdr.markForCheck).not.toHaveBeenCalled();f.c.createTemplate();f.c.reload();expect(f.svc.createTemplate).toHaveBeenCalledTimes(1);expect(f.svc.getTemplates).toHaveBeenCalledTimes(1);});
 it('permits an explicit retry after a failed create',()=>{const f=fixture();f.c.createTemplate();f.save.error(Error('Synthetic failure'));const retry=new Subject<any>();f.svc.createTemplate.mockReturnValue(retry);f.c.createTemplate();retry.next({id:'TEST-RETRY'});retry.complete();expect(f.c.createError).toBe('');expect(f.c.createMessage).toBe('Template created.');});
});
