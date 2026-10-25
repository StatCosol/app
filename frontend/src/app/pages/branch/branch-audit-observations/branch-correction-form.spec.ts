import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { page } from '@vitest/browser/context';
import { BranchAuditObservationsComponent } from './branch-audit-observations.component';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { HelpdeskService } from '../../../core/helpdesk.service';
import { ToastService } from '../../../shared/toast/toast.service';
describe('Branch correction form',()=>{
 it.each([390,768,1280])('restores corrections without overwriting edits at %s',async width=>{
  await page.viewport(width,900); let messages=new Subject<any[]>(); const postMessage=vi.fn(()=>of({}));
  await TestBed.configureTestingModule({imports:[BranchAuditObservationsComponent],providers:[
   {provide:AuthService,useValue:{getBranchIds:()=>[]}}, {provide:ClientBranchesService,useValue:{}},
   {provide:HelpdeskService,useValue:{getMessages:()=>messages,postMessage}}, {provide:ToastService,useValue:{error:()=>{},success:()=>{}}}
  ]}).compileComponents();
  const f=TestBed.createComponent(BranchAuditObservationsComponent);f.detectChanges();const c=f.componentInstance;
  const obs:any={id:'test',observationRef:'TEST',category:'Test',description:'Synthetic',severity:'MINOR',status:'OPEN',assignedTo:'Owner'};
  c.observations=[obs];c.filteredObservations=[obs];c.selectObservation(obs);f.detectChanges();
  expect(f.nativeElement.querySelector('.action-row').textContent).toContain('Create Closure Case');
  c.cases=[{id:'case',ticketRef:'TEST',observationId:'test',status:'OPEN',capaStatus:'OPEN',rootCause:'Original',correctiveAction:'Original',actionOwner:'Owner',targetDueDate:'2099-12-31',closureRecommendation:'',evidenceFiles:[],createdAt:'2026-10-26T00:00:00Z'} as any];
  c.selectObservation(obs);c.draft.actionOwner='Unsaved edit';
  messages.next([{id:'update',createdAt:'2026-10-26T01:00:00Z',message:'[AUDIT_CLOSURE_UPDATE]\nRoot Cause: Corrected cause\nCorrective Action: Corrected action\nAction Owner: Saved owner\nCAPA Status: IN_PROGRESS'}]);messages.complete();
  f.detectChanges();await f.whenStable();f.detectChanges();
  expect(c.draft.rootCause).toBe('Corrected cause');expect(c.draft.correctiveAction).toBe('Corrected action');
  expect(c.draft.capaStatus).toBe('IN_PROGRESS');expect(c.draft.actionOwner).toBe('Unsaved edit');
  const actions=f.nativeElement.querySelector('.action-row');const button=actions.querySelector('button');
  expect(actions.textContent).toContain('Update Closure Case');expect(actions.querySelector('.compact-action')).toBeNull();
  expect(button.getAttribute('aria-label')).toBeNull();expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth+1);
  expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth+1);
  // A comment refresh begins after the user has already edited the form.
  // None of those edits may be replaced by the previously saved case values.
  c.draft={rootCause:'Unsaved root cause',correctiveAction:'Unsaved correction',actionOwner:'Unsaved owner',targetDueDate:'2099-11-30',closureRecommendation:'Unsaved recommendation',capaStatus:'READY_FOR_VERIFICATION',notes:'TEST progress comment'};
  const expectedDraft={...c.draft,notes:''};
  messages=new Subject<any[]>();
  c.addComment();
  expect(postMessage).toHaveBeenCalledWith('case','[BRANCH_COMMENT]\nTEST progress comment');
  messages.next([{id:'saved-update',createdAt:'2026-10-26T01:00:00Z',message:'[AUDIT_CLOSURE_UPDATE]\nRoot Cause: Previously saved cause\nCorrective Action: Previously saved correction\nAction Owner: Saved owner\nTarget Due Date: 2099-12-31\nClosure Recommendation: Previously saved recommendation\nCAPA Status: IN_PROGRESS'},{id:'comment',createdAt:'2026-10-26T02:00:00Z',message:'[BRANCH_COMMENT]\nTEST progress comment'}]);
  messages.complete();f.detectChanges();await f.whenStable();f.detectChanges();
  expect(c.draft).toEqual(expectedDraft);
  expect(c.selectedCases[0].rootCause).toBe('Previously saved cause');
  expect(c.selectedMessages.some(m=>m.id==='comment')).toBe(true);
  f.destroy();TestBed.resetTestingModule();
 });
});
