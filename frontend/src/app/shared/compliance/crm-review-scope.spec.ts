import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { CrmBranchDocsReviewComponent } from '../../pages/crm/branch-docs-review/crm-branch-docs-review.component';

function setup() {
  const api = {
    listCrmDocs: vi.fn().mockReturnValue(of({ data: [] })),
    getCrmKpis: vi.fn().mockReturnValue(of({ pending_review: 0 })),
    reviewDocument: vi.fn().mockReturnValue(of({})),
  };
  const c = new CrmBranchDocsReviewComponent(api as any, { warning: vi.fn(), error: vi.fn() } as any, {} as any, { detectChanges: vi.fn() } as any, {} as any);
  return { c, api };
}
const testDoc = { id: 'test-doc', status: 'SUBMITTED', uploadedFileName: 'TEST-review.pdf' } as any;

describe('CRM compliance review scope', () => {
  it('offers every supported submission year, including the isolated fixture period', () => {
    const { c } = setup();
    expect(c.years).toEqual(Array.from({ length: 31 }, (_, i) => 2020 + i));
  });
  it.each(['ACTUAL', 'TEST'] as const)('uses %s for both records and counts', recordScope => {
    const { c, api } = setup();
    c.recordScope = recordScope; c.selectedYear = 2050; c.selectedFrequency = 'MONTHLY'; c.selectedMonth = 10;
    c.load();
    for (const read of [api.listCrmDocs, api.getCrmKpis]) expect(read).toHaveBeenCalledWith(expect.objectContaining({ recordScope, year: 2050, frequency: 'MONTHLY', month: 10 }));
  });
  it('starts in actual scope and never infers test scope from the year', () => {
    const { c, api } = setup(); c.selectedYear = 2050; c.load();
    expect(api.listCrmDocs).toHaveBeenCalledWith(expect.objectContaining({ recordScope: 'ACTUAL' }));
  });
  it('clears old records, counts and review drafts and cancels late reads on scope changes', () => {
    const { c, api } = setup(); const oldList = new Subject<any>(), oldCounts = new Subject<any>(), newList = new Subject<any>(), newCounts = new Subject<any>();
    api.listCrmDocs.mockReturnValueOnce(oldList).mockReturnValueOnce(newList);
    api.getCrmKpis.mockReturnValueOnce(oldCounts).mockReturnValueOnce(newCounts);
    c.load(); oldList.next({data:[testDoc]}); oldList.complete(); oldCounts.next({pending_review:1});
    c.openReviewModal(testDoc, 'REUPLOAD_REQUIRED'); c.reviewRemarks = 'old scope';
    c.recordScope = 'TEST'; c.load();
    expect(c.documents).toEqual([]); expect(c.kpis).toBeNull(); expect(c.showReviewModal).toBe(false); expect(c.reviewRemarks).toBe('');
    newList.next({data:[{id:'new'}]}); newCounts.next({pending_review:2});
    oldCounts.next({pending_review:999}); oldList.next({data:[testDoc]});
    expect(c.documents[0].id).toBe('new'); expect(c.kpis.pending_review).toBe(2); c.ngOnDestroy();
  });
  it('keeps failed reads unavailable and supports retry', () => {
    const { c, api } = setup();
    api.listCrmDocs.mockReturnValueOnce(throwError(() => new Error('offline')));
    api.getCrmKpis.mockReturnValueOnce(throwError(() => new Error('offline')));
    c.load(); expect(c.loadError).toBeTruthy(); expect(c.kpiError).toBeTruthy(); expect(c.kpis).toBeNull();
    c.load(); expect(c.loadError).toBe(''); expect(c.kpiError).toBe('');
  });
  it('rejects stale document actions after scope changes', () => {
    const { c, api } = setup(); c.documents = [testDoc]; c.openReviewModal(testDoc, 'APPROVED'); c.load();
    c.openReviewModal(testDoc, 'APPROVED'); c.submitReview();
    expect(c.showReviewModal).toBe(false); expect(api.reviewDocument).not.toHaveBeenCalled();
  });
  it('prevents duplicate reviews and refreshes the same scope after completion', () => {
    const { c, api } = setup(); const pending = new Subject<any>(); api.reviewDocument.mockReturnValue(pending);
    c.recordScope = 'TEST'; c.documents = [testDoc]; c.openReviewModal(testDoc, 'REUPLOAD_REQUIRED'); c.reviewRemarks = 'TEST correction';
    c.submitReview(); c.submitReview(); c.load();
    expect(api.reviewDocument).toHaveBeenCalledTimes(1); expect(api.listCrmDocs).not.toHaveBeenCalled();
    pending.next({}); pending.complete();
    expect(c.reviewing).toBe(false); expect(c.showReviewModal).toBe(false);
    expect(api.listCrmDocs).toHaveBeenCalledWith(expect.objectContaining({recordScope:'TEST'}));
  });
});
