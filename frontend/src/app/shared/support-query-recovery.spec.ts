import '@angular/compiler';
describe('Support recovery edge cases', () => {
  it('clears only an unchanged submitted query', () => { const f=query(); f.c.submit(); f.response.next({}); f.response.complete(); expect(f.c.message).toBe(''); expect(f.c.resultText).toBe('Query submitted.'); expect(f.c.isSubmitting).toBe(false); });
  it('keeps the entire query draft if only its routing type changes', () => { const f=query(); f.c.submit(); f.c.queryType='AUDIT'; f.response.next({}); expect(f.c.message).toBe('Synthetic query'); expect(f.c.resultText).toContain('newer'); });
  it('validates blank messages without a request', () => { const f=query(); f.c.message=' '; f.c.submit(); expect(f.api.createQuery).not.toHaveBeenCalled(); expect(f.c.resultIsError).toBe(true); });
  it('can retry a failed query without losing input', () => { const f=query(); f.c.submit(); f.response.error(Error('TEST outage')); const retry=new Subject<any>(); f.api.createQuery.mockReturnValue(retry); f.c.submit(); expect(f.c.resultIsError).toBe(false); retry.next({}); retry.complete(); expect(f.c.resultText).toBe('Query submitted.'); });
  it('ignores completion for another client scope', () => { const f=query(); f.c.clientId='TEST-A'; f.c.submit(); f.c.clientId='TEST-B'; f.c.message='TEST-B draft'; f.response.next({}); f.response.complete(); expect(f.c.message).toBe('TEST-B draft'); expect(f.c.resultText).toBe(''); });
  it('stops query callbacks after leaving the form', () => { const f=query(); f.c.submit(); f.c.ngOnDestroy(); f.response.next({}); expect(f.c.message).toBe('Synthetic query'); expect(f.response.observed).toBe(false); f.c.submit(); expect(f.api.createQuery).toHaveBeenCalledTimes(1); });
  it('retains Branch drafts on failure and permits a retry', () => { const f=branch(); f.c.submitTicket(); f.response.error(Error('TEST outage')); expect(f.c.submitting).toBe(false); expect(f.c.showNewTicketForm).toBe(true); expect(f.c.newTicket.message).toBe('Synthetic query'); expect(f.toast.error).toHaveBeenCalled(); const retry=new Subject<any>(); f.api.createTicket.mockReturnValue(retry); f.c.submitTicket(); retry.next({}); retry.complete(); expect(f.c.showNewTicketForm).toBe(false); expect(f.c.newTicket.message).toBe(''); });
  it('does not duplicate a Branch query while pending', () => { const f=branch(); f.c.submitTicket(); f.c.submitTicket(); expect(f.api.createTicket).toHaveBeenCalledTimes(1); });
  it('does not update Branch forms after navigation away', () => { const f=branch(); f.c.submitTicket(); f.c.ngOnDestroy(); f.response.next({}); expect(f.toast.success).not.toHaveBeenCalled(); expect(f.c.newTicket.message).toBe('Synthetic query'); });
  it('forwards server failures instead of inventing empty Branch results', () => { const response=new Subject<any>(); const api=new BranchThreadApiService({get:()=>response} as any,{} as any); const error=vi.fn(); api.list({}).subscribe({error}); response.error(Error('TEST outage')); expect(error).toHaveBeenCalled(); });
  it('normalizes paging and omits cleared filters', () => { const http={get:vi.fn((_u:string,_o:any)=>of({data:[],total:0,page:1,limit:100}))}; const api=new BranchThreadApiService(http as any,{} as any); let result:any; api.list({page:-2,limit:1000,q:' ',unread:false}).subscribe(r=>result=r); const p=http.get.mock.calls[0][1].params; expect(p.get('page')).toBe('1'); expect(p.get('limit')).toBe('100'); expect(p.has('q')).toBe(false); expect(p.has('unreadOnly')).toBe(false); expect(result.total).toBe(0); });
});
import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CreateQueryComponent } from './notifications/create-query/create-query.component';
import { BranchHelpdeskComponent } from '../pages/branch/branch-helpdesk/branch-helpdesk.component';
import { BranchThreadApiService } from '../core/branch-thread-api.service';

function query() {
  const response = new Subject<any>();
  const api = { createQuery: vi.fn(() => response) };
  const c = new CreateQueryComponent(api as any);
  c.subject = 'TEST original'; c.message = 'Synthetic query';
  return { c, api, response };
}
function branch() {
  const response = new Subject<any>();
  const api = { createTicket: vi.fn(() => response) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const c = new BranchHelpdeskComponent(api as any, toast as any, { markForCheck: vi.fn() } as any);
  c.showNewTicketForm = true;
  c.newTicket = { queryType: 'COMPLIANCE', subject: 'TEST original', message: 'Synthetic query' };
  return { c, api, response, toast };
}
describe('Support query recovery', () => {
  it('preserves newer Client/Contractor draft edits when a submission completes', () => {
    const {c,response}=query(); c.submit(); c.message='Synthetic next'; response.next({threadId:'TEST-1'});
    expect(c.message).toBe('Synthetic next'); expect(c.subject).toBe('TEST original');
  });
  it('blocks duplicate query submissions while pending', () => {
    const {c,api}=query(); c.submit(); c.submit(); expect(api.createQuery).toHaveBeenCalledTimes(1);
  });
  it('does not show success for a server rejection', () => {
    const {c,response}=query(); c.submit(); response.error(new Error('Synthetic outage'));
    expect((c as any).resultIsError).toBe(true); expect(c.message).toBe('Synthetic query');
  });
  it('preserves newer Branch drafts and keeps their editor open after sending', () => {
    const {c,response}=branch(); c.submitTicket(); c.newTicket.subject='TEST next'; response.next({});
    expect(c.newTicket.subject).toBe('TEST next'); expect(c.showNewTicketForm).toBe(true);
  });
  it('requests the selected Branch inbox page and preserves the server total', () => {
    const http={get:vi.fn((_url:string, _options:any) => of({data:[{id:'TEST-21',subject:'TEST page 2'}],total:42,page:2,limit:20}))};
    const api=new BranchThreadApiService(http as any, {} as any); let page:any;
    api.list({page:2,limit:20}).subscribe(r=>page=r);
    expect(http.get.mock.calls[0]?.[1]?.params.get('page')).toBe('2');
    expect(page.total).toBe(42); expect(page.items.map((r:any)=>r.id)).toEqual(['TEST-21']);
  });
  it('applies Branch subject/type filters on the server across all pages', () => {
    const http={get:vi.fn((_url:string, _options:any) => of({data:[{id:'TEST-42',subject:'TEST match',queryType:'AUDIT'}],total:1,page:1,limit:20}))};
    const api=new BranchThreadApiService(http as any, {} as any);
    api.list({q:'TEST match',type:'AUDIT',status:'OPEN',unread:true}).subscribe();
    const params=http.get.mock.calls[0]?.[1]?.params;
    expect(params.get('q')).toBe('TEST match'); expect(params.get('queryType')).toBe('AUDIT');
  });
});
