import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { of, Subject } from 'rxjs';
import { CrmBranchDocsReviewComponent } from './crm-branch-docs-review.component';
import { BranchComplianceDocService } from '../../../core/branch-compliance-doc.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

afterEach(() => TestBed.resetTestingModule());
const rows = Array.from({length:51}, (_, i) => ({id:`TEST-${i+1}`, returnName:`Synthetic return ${i+1}`,
  returnCode:`TEST-${i+1}`, status:'SUBMITTED', frequency:'MONTHLY', periodYear:2050, periodMonth:10,
  uploadedFileName:`TEST-${i+1}.pdf`, version:1, branch:{branchName:'Synthetic branch'}}));
async function setup() {
  const api = {
    listCrmDocs:vi.fn((q:any) => of({data:rows.slice(((q.page||1)-1)*50,(q.page||1)*50),total:rows.length})),
    getCrmKpis:vi.fn(() => of({pending_review:51})), reviewDocument:vi.fn(() => of({})),
  };
  await TestBed.configureTestingModule({imports:[CrmBranchDocsReviewComponent], providers:[
    provideRouter([]), {provide:BranchComplianceDocService,useValue:api},
    {provide:ToastService,useValue:{error:vi.fn(),warning:vi.fn()}}, {provide:ProtectedFileService,useValue:{}},
  ]}).compileComponents();
  const f=TestBed.createComponent(CrmBranchDocsReviewComponent);
  f.componentInstance.recordScope='TEST'; f.componentInstance.selectedYear=2050;
  f.detectChanges(); await f.whenStable();
  return {f,c:f.componentInstance,api,root:f.nativeElement as HTMLElement};
}
for (const width of [390,768,1440]) it(`can reach and review document 51 at ${width}px`,async()=>{
  await page.viewport(width,900);
  const {f,c,api,root}=await setup();
  const next=root.querySelector('[aria-label="Next document page"]') as HTMLButtonElement;
  expect(next).not.toBeNull(); next.click(); f.detectChanges(); await f.whenStable();
  expect(api.listCrmDocs).toHaveBeenLastCalledWith(expect.objectContaining({page:2,pageSize:50,recordScope:'TEST',year:2050}));
  expect(root.textContent).toContain('Synthetic return 51');
  expect(root.textContent).toContain('Page 2 of 2');
  expect(root.textContent).toContain('1 pending review on this page');
  expect((root.querySelector('[aria-label="Next document page"]') as HTMLButtonElement).disabled).toBe(true);
  c.openReviewModal(c.documents[0], 'APPROVED'); c.submitReview(); f.detectChanges();
  expect(api.reviewDocument).toHaveBeenCalledWith('TEST-51','APPROVED',undefined);
  expect(api.listCrmDocs).toHaveBeenLastCalledWith(expect.objectContaining({page:2,recordScope:'TEST'}));
  expect(root.scrollWidth).toBeLessThanOrEqual(width);
});
it('resets filters to page one and cancels a stale page response across record scopes',async()=>{
  const {f,c,api,root}=await setup();
  const old=new Subject<any>(); api.listCrmDocs.mockReturnValueOnce(old as any);
  c.changePage(2); f.detectChanges(); expect(root.querySelector('[aria-label="Document pages"]')).toBeNull();
  c.changePage(3); expect(api.listCrmDocs).toHaveBeenCalledTimes(2);
  api.listCrmDocs.mockReturnValueOnce(of({data:[],total:0}));
  const scope=root.querySelector('[aria-label="Records"]') as HTMLSelectElement;
  scope.value='ACTUAL'; scope.dispatchEvent(new Event('change')); await f.whenStable(); f.detectChanges();
  old.next({data:[rows[50]],total:51}); old.complete(); f.detectChanges();
  expect(api.listCrmDocs).toHaveBeenLastCalledWith(expect.objectContaining({recordScope:'ACTUAL',page:1}));
  expect(c.documents).toEqual([]); expect(c.total).toBe(0); expect(c.page).toBe(1);
  expect(root.textContent).not.toContain('Synthetic return 51');
});
it('retries a failed second page without showing an empty result or stale count',async()=>{
  const {f,c,api,root}=await setup();
  const failed=new Subject<any>(); api.listCrmDocs.mockReturnValueOnce(failed as any);
  c.changePage(2); failed.error(new Error('synthetic outage')); f.detectChanges();
  expect(root.textContent).toContain('Documents could not be loaded');
  expect(root.textContent).not.toContain('No documents to review for');
  expect(root.querySelector('[aria-label="Document pages"]')).toBeNull();
  const retry=Array.from(root.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Retry')!;
  retry.click(); f.detectChanges(); await f.whenStable();
  expect(api.listCrmDocs).toHaveBeenLastCalledWith(expect.objectContaining({page:2,recordScope:'TEST'}));
  expect(root.textContent).toContain('Synthetic return 51');
});
it('returns to the last available page when approval empties the last filtered page',async()=>{
  const {f,c,api}=await setup();
  c.selectedStatus='SUBMITTED'; c.load(); c.changePage(2);
  const reviewing=new Subject<any>(); api.reviewDocument.mockReturnValueOnce(reviewing as any);
  c.openReviewModal(c.documents[0],'APPROVED'); c.submitReview();
  const before=api.listCrmDocs.mock.calls.length; c.changePage(1);
  expect(api.listCrmDocs).toHaveBeenCalledTimes(before);
  api.listCrmDocs.mockReturnValueOnce(of({data:[],total:50})).mockReturnValueOnce(of({data:rows.slice(0,50),total:50}));
  reviewing.next({}); reviewing.complete(); f.detectChanges();
  expect(c.page).toBe(1); expect(c.total).toBe(50); expect(c.documents).toHaveLength(50);
  expect(api.listCrmDocs).toHaveBeenLastCalledWith(expect.objectContaining({page:1,status:'SUBMITTED',recordScope:'TEST'}));
});
