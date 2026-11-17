import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { of, Subject } from 'rxjs';
import { ComplianceDocumentRecordsComponent } from '../shared/compliance/compliance-document-records.component';
import { BranchComplianceDocService } from '../core/branch-compliance-doc.service';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';
import { ToastService } from '../shared/toast/toast.service';

afterEach(() => TestBed.resetTestingModule());

const returned = {
  id: 'TEST-DOC', returnName: 'Synthetic PF ECR', frequency: 'MONTHLY',
  periodYear: 2050, periodMonth: 10, version: 1, status: 'REUPLOAD_REQUIRED',
  remarks: 'TEST ONLY: Correct the branch and period.\nKeep this synthetic evidence separate.',
};

async function setup(portal: string, documents: any[]) {
  const read = vi.fn(() => of({ data: documents, total: documents.length }));
  await TestBed.configureTestingModule({ imports: [ComplianceDocumentRecordsComponent], providers: [
    provideRouter([]), { provide: BranchComplianceDocService, useValue: { listBranchDocs: read, listClientDocs: read, listCrmDocs: read } },
    { provide: ProtectedFileService, useValue: {} }, { provide: ToastService, useValue: {} },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(ComplianceDocumentRecordsComponent);
  const c = fixture.componentInstance;
  c.branch = portal === 'Branch'; c.crm = portal === 'CRM';
  c.branchId = 'TEST-BRANCH'; c.companyId = 'TEST-COMPANY'; c.year = 2050;
  c.load(); fixture.detectChanges(); await fixture.whenStable();
  return { fixture, c, read, root: fixture.nativeElement as HTMLElement };
}

for (const portal of ['Branch', 'Client', 'CRM']) {
  for (const width of [390, 768, 1440]) {
    it(`${portal}: shows correction instructions without overflow at ${width}px`, async () => {
      await page.viewport(width, 900);
      const remarks = returned.remarks + '\n' + 'TEST-long-reference-'.repeat(45);
      const { fixture, root } = await setup(portal, [{ ...returned, remarks }]);
      const feedback = root.querySelector('[role="note"]') as HTMLElement;
      expect(feedback.textContent).toContain('Correction required');
      expect(feedback.textContent).toContain(remarks);
      expect(feedback.textContent).toContain('Version 1');
      expect(feedback.getAttribute('aria-label')).toContain('Synthetic PF ECR, 2050-10');
      expect(feedback.closest('td')?.colSpan).toBe(portal === 'Branch' ? 4 : 5);
      expect(root.scrollWidth).toBeLessThanOrEqual(width);
      expect(feedback.scrollWidth).toBeLessThanOrEqual(feedback.clientWidth + 1);
      fixture.destroy();
    });
  }
}

it.each([null, '   '])('explains missing correction reason (%s) without inventing feedback', async remarks => {
  const { root } = await setup('Branch', [{ ...returned, remarks }]);
  expect(root.textContent).toContain('No correction reason was provided. Contact your CRM reviewer');
});

it('renders reviewer text safely and distinguishes approved remarks from correction instructions', async () => {
  const remarks = '<img src=x onerror=alert(1)> TEST review';
  const { root } = await setup('Client', [{ ...returned, status: 'APPROVED', remarks }]);
  expect(root.querySelector('[role="note"]')?.textContent).toContain('CRM review remarks');
  expect(root.textContent).toContain(remarks);
  expect(root.querySelector('[role="note"] img')).toBeNull();
  expect(root.textContent).not.toContain('Correction required');
});

it('removes old feedback during a scope change and after a corrected resubmission', async () => {
  const { fixture, root, c, read } = await setup('Branch', [returned]);
  const pending = new Subject<any>();
  read.mockReturnValueOnce(pending as any);
  c.recordScope = 'TEST'; c.resetPage(); fixture.detectChanges();
  expect(root.querySelector('[role="note"]')).toBeNull();
  expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ recordScope: 'TEST' }));
  pending.next({ data: [{ ...returned, status: 'RESUBMITTED', version: 2, remarks: null }], total: 1 });
  fixture.detectChanges();
  expect(root.textContent).toContain('RESUBMITTED');
  expect(root.querySelector('[role="note"]')).toBeNull();
});
