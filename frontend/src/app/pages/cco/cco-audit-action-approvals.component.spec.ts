import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { page } from '@vitest/browser/context';
import { CcoAuditActionApprovalsComponent } from './cco-audit-action-approvals.component';
import { AuditsService } from '../../core/audits.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';

const request={id:'test-request',audit_id:'test-audit',action:'CANCEL',status:'PENDING_CCO',reason:'TEST ONLY '+ 'Long-review-reason-'.repeat(30),requestedByName:'Test CRM',requested_at:'2026-10-24T09:00:00Z',currentAuditStatus:'PLANNED',audit_snapshot:{clientName:'Test client',branchName:'Test branch',contractorName:'Test vendor',audit_code:'TEST-2099',audit_type:'CONTRACTOR',period_code:'2099-11'}};
function setup(){
  const api={ccoAuditActionRequests:vi.fn(()=>of([request])),ccoReviewAuditAction:vi.fn(()=>of({status:'APPROVED'}))};
  const dialog={prompt:vi.fn(async()=>({confirmed:true,value:'TEST ONLY CCO review'}))};
  const component=new CcoAuditActionApprovalsComponent(api as any,dialog as any,{markForCheck:vi.fn()} as any);
  return{api,dialog,component};
}
describe('CCO audit action approvals',()=>{
  it('sends a reasoned approval and reloads current state',async()=>{const t=setup();await t.component.review(request,'APPROVE');expect(t.api.ccoReviewAuditAction).toHaveBeenCalledWith('test-request','APPROVE','TEST ONLY CCO review');expect(t.api.ccoAuditActionRequests).toHaveBeenCalled();});
  it('rejects without claiming the audit was cancelled',async()=>{const t=setup();await t.component.review(request,'REJECT');expect(t.api.ccoReviewAuditAction).toHaveBeenCalledWith('test-request','REJECT','TEST ONLY CCO review');expect(t.component.message).toContain('audit unchanged');});
  it('does not act on dismiss, blank notes, completed requests or duplicate clicks',async()=>{const t=setup();t.dialog.prompt.mockResolvedValueOnce({confirmed:false,value:''});await t.component.review(request,'APPROVE');t.dialog.prompt.mockResolvedValueOnce({confirmed:true,value:' '});await t.component.review(request,'APPROVE');await t.component.review({...request,status:'APPROVED'},'APPROVE');expect(t.api.ccoReviewAuditAction).not.toHaveBeenCalled();const pending=new Subject<any>();t.api.ccoReviewAuditAction.mockReturnValue(pending);await t.component.review(request,'APPROVE');await t.component.review(request,'APPROVE');expect(t.api.ccoReviewAuditAction).toHaveBeenCalledTimes(1);pending.complete();});
  it('keeps server refusal visible and leaves request pending',async()=>{const t=setup();t.api.ccoReviewAuditAction.mockReturnValue(throwError(()=>({error:{message:'Audit has a submitted report'}})));await t.component.review(request,'APPROVE');expect(t.component.error).toContain('submitted report');expect(t.component.message).toBe('');expect(t.component.busy).toBe(false);});
  it.each([390,1024])('shows scope, distinct actions and wrapped reasons at %s pixels',async width=>{
    await page.viewport(width,1000);const t=setup();
    await TestBed.configureTestingModule({imports:[CcoAuditActionApprovalsComponent],providers:[{provide:AuditsService,useValue:t.api},{provide:ConfirmDialogService,useValue:t.dialog}]}).compileComponents();
    const fixture=TestBed.createComponent(CcoAuditActionApprovalsComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const article=fixture.nativeElement.querySelector('article') as HTMLElement;
    expect(article.textContent).toContain('Test client');expect(article.textContent).toContain('Test branch');expect(article.textContent).toContain('Test vendor');expect(article.textContent).toContain('2099-11');
    expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth+1);
    const buttons=Array.from(article.querySelectorAll('button'));expect(buttons.map(b=>b.textContent).join(' ')).toContain('Approve cancellation');expect(buttons.map(b=>b.textContent).join(' ')).toContain('Reject request');
    expect(buttons.every(b=>b.getBoundingClientRect().height>=40)).toBe(true);
    fixture.destroy();TestBed.resetTestingModule();
  });
});
