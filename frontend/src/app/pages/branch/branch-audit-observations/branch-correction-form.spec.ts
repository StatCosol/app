import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { page } from '@vitest/browser/context';
import { BranchAuditObservationsComponent } from './branch-audit-observations.component';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { HelpdeskService } from '../../../core/helpdesk.service';
import { ToastService } from '../../../shared/toast/toast.service';
describe('Branch correction form',()=>{
 it.each([390,768,1280])('restores corrections without overwriting edits at %s',async width=>{
  await page.viewport(width,900); const messages=new Subject<any[]>();
  await TestBed.configureTestingModule({imports:[BranchAuditObservationsComponent],providers:[
   {provide:AuthService,useValue:{getBranchIds:()=>[]}}, {provide:ClientBranchesService,useValue:{}},
   {provide:HelpdeskService,useValue:{getMessages:()=>messages}}, {provide:ToastService,useValue:{error:()=>{}}}
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
  f.destroy();TestBed.resetTestingModule();
 });
});
