import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { CrmBranchDocsReviewComponent } from './crm-branch-docs-review.component';
import { BranchComplianceDocService } from '../../../core/branch-compliance-doc.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

afterEach(() => TestBed.resetTestingModule());

it.each(['success', 'failure'])('renders explicit test scope and supported years with %s counts', async outcome => {
  const pending = new Subject<any>();
  const api = { listCrmDocs: vi.fn(() => of({data:[]})), getCrmKpis: vi.fn().mockReturnValueOnce(of({pending_review:6})).mockReturnValue(pending) };
  await TestBed.configureTestingModule({imports:[CrmBranchDocsReviewComponent], providers:[
    provideRouter([]), {provide:BranchComplianceDocService,useValue:api},
    {provide:ToastService,useValue:{}}, {provide:ProtectedFileService,useValue:{}},
  ]}).compileComponents();
  const fixture = TestBed.createComponent(CrmBranchDocsReviewComponent);
  fixture.detectChanges(); await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const year = root.querySelector('[aria-label="Year"]') as HTMLSelectElement;
  expect(Array.from(year.options).map(o=>o.textContent?.trim())).toContain('2050');
  const scope = root.querySelector('[aria-label="Records"]') as HTMLSelectElement;
  expect(scope.value).toBe('ACTUAL');
  scope.value='TEST'; scope.dispatchEvent(new Event('change'));
  await fixture.whenStable(); fixture.detectChanges();
  expect(root.textContent).toContain('TEST DATA ONLY');
  expect(root.querySelector('.kpi-grid')).toBeNull();
  expect(api.getCrmKpis).toHaveBeenLastCalledWith(expect.objectContaining({recordScope:'TEST'}));
  if(outcome==='failure') pending.error(new Error('test outage'));
  else pending.next({pending_review:1});
  fixture.detectChanges();
  expect(!!root.querySelector('[role="alert"]')).toBe(outcome==='failure');
  fixture.componentInstance.reviewing=true; fixture.detectChanges();
  expect((root.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  fixture.destroy();
});
