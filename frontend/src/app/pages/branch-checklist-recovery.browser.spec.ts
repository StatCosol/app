import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { of, Subject } from 'rxjs';
import { BranchComplianceDocsComponent } from './branch/branch-compliance-docs/branch-compliance-docs.component';
import { BranchComplianceDocService } from '../core/branch-compliance-doc.service';
import { ClientBranchesService } from '../core/client-branches.service';
import { AuthService } from '../core/auth.service';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';
import { ToastService } from '../shared/toast/toast.service';
import { ConfirmDialogService } from '../shared/ui/confirm-dialog/confirm-dialog.service';

afterEach(() => TestBed.resetTestingModule());
const rows = [{ returnCode: 'TEST-PF', returnName: 'Synthetic PF return', document: null }];
async function setup() {
  const api = { getChecklist: vi.fn(() => of({ data: rows })), listBranchDocs: vi.fn(() => of({data:[],total:0})), uploadDocument: vi.fn() };
  await TestBed.configureTestingModule({imports:[BranchComplianceDocsComponent],providers:[
    provideRouter([]), {provide:BranchComplianceDocService,useValue:api},
    {provide:ClientBranchesService,useValue:{list:()=>of([{id:'TEST-BRANCH',branchName:'Synthetic branch'}])}},
    {provide:AuthService,useValue:{getBranchIds:()=>['TEST-BRANCH']}},
    {provide:ProtectedFileService,useValue:{}}, {provide:ToastService,useValue:{error:vi.fn()}},
    {provide:ConfirmDialogService,useValue:{confirm:vi.fn()}},
  ]}).compileComponents();
  const f=TestBed.createComponent(BranchComplianceDocsComponent);f.detectChanges();await f.whenStable();
  return {f,c:f.componentInstance,api,root:f.nativeElement as HTMLElement};
}
for(const width of [390,768,1440]) it('distinguishes a failed read and retries without losing the draft at '+width+'px',async()=>{
  await page.viewport(width,900);
  const {f,c,api,root}=await setup();
  const file=new File(['synthetic'],'TEST-draft.pdf');
  c.selectedFile=file;c.uploadNotes='Unsaved test notes';c.uploadReturnCode='TEST-PF';
  const failed=new Subject<any>();api.getChecklist.mockReturnValueOnce(failed as any);
  c.loadAll();failed.error(new Error('simulated outage'));f.detectChanges();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Unable to load the compliance checklist');
  expect(root.textContent).not.toContain('No checklist items found.');
  expect(c.kpis).toBeNull();
  expect((root.querySelector('[aria-label="Upload"]') as HTMLButtonElement).disabled).toBe(true);
  const retry=new Subject<any>();api.getChecklist.mockReturnValueOnce(retry as any);
  (root.querySelector('[aria-label="Retry checklist"]') as HTMLButtonElement).click();f.detectChanges();
  expect(root.querySelector('[role="alert"]')).toBeNull();
  expect(c.loading).toBe(true);retry.next({data:rows});f.detectChanges();await f.whenStable();
  expect(c.selectedFile).toBe(file);expect(c.uploadNotes).toBe('Unsaved test notes');expect(c.uploadReturnCode).toBe('TEST-PF');
  expect(c.kpis).not.toBeNull();expect(root.textContent).toContain('Synthetic PF return');
  expect(root.scrollWidth).toBeLessThanOrEqual(width);
});
it('allows a genuine empty result after recovery without retaining the error',async()=>{
  const {f,c,api,root}=await setup();
  const failed=new Subject<any>();api.getChecklist.mockReturnValueOnce(failed as any);
  c.loadAll();failed.error(new Error('test'));f.detectChanges();
  api.getChecklist.mockReturnValueOnce(of({data:[]}));c.loadAll();f.detectChanges();
  expect(root.querySelector('[role="alert"]')).toBeNull();expect(root.textContent).toContain('No checklist items found.');
});
