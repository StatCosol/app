import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { BranchComplianceDocsComponent } from '../../pages/branch/branch-compliance-docs/branch-compliance-docs.component';
import { ComplianceDocumentRecordsComponent } from './compliance-document-records.component';

function setup() {
  const docs = { uploadDocument: vi.fn().mockReturnValue(of({})), getChecklist: vi.fn().mockReturnValue(of({ data: [] })) };
  const dialog = { confirm: vi.fn().mockResolvedValue(true) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const c = new BranchComplianceDocsComponent(docs as any, { getBranchIds: () => ['branch-a'] } as any, {} as any, {} as any, toast as any, dialog as any, { markForCheck: vi.fn() } as any);
  c.branchId = 'branch-a'; c.year = 2026; c.month = 10; c.quarter = 4; c.half = 2;
  c.uploadReturnCode = 'RETURN'; c.checklistRows = [{ returnCode: 'RETURN', frequency: 'MONTHLY', document: null }];
  c.selectedFile = new File(['%PDF-1.7'], 'return.pdf', { type: 'application/pdf' });
  return { c, docs, dialog, toast };
}
describe('document upload UI', () => {
  it.each([
    ['MONTHLY', 'periodMonth', '10'], ['QUARTERLY', 'periodQuarter', '4'], ['HALF_YEARLY', 'periodHalf', '2'], ['YEARLY', null, null],
  ])('sends the supported %s contract and no legacy metadata', async (frequency, periodKey, value) => {
    const { c, docs } = setup(); c.frequency = frequency;
    await c.upload(); const fd = docs.uploadDocument.mock.calls[0][0] as FormData;
    expect(fd.get('branchId')).toBe('branch-a'); expect(fd.get('frequency')).toBe(frequency); expect(fd.get('periodYear')).toBe('2026');
    for (const key of ['periodMonth', 'periodQuarter', 'periodHalf']) expect(fd.get(key)).toBe(key === periodKey ? value : null);
    for (const key of ['monthKey', 'category', 'subCategory', 'notes']) expect(fd.has(key)).toBe(false);
  });
  it('offers only applicable, unlocked checklist entries', () => {
    const { c } = setup(); c.checklistRows = [{ returnCode: 'valid' }, { returnCode: 'locked', document: { isLocked: true } }];
    expect(c.availableReturns.map(r => r.returnCode)).toEqual(['valid']);
  });
  it('cancels stale period loads rather than displaying an older branch response', () => {
    const { c, docs } = setup(); const old = new Subject<any>(), current = new Subject<any>();
    docs.getChecklist.mockReturnValueOnce(old).mockReturnValueOnce(current);
    c.loadAll(); c.branchId = 'branch-b'; c.loadAll();
    current.next({ data: [{ returnCode: 'current' }] }); old.next({ data: [{ returnCode: 'stale' }] });
    expect(c.checklistRows[0].returnCode).toBe('current'); c.ngOnDestroy();
  });
  it('prevents two upload requests while confirmation is open', async () => {
    const { c, docs, dialog } = setup(); let accept!: (ok: boolean) => void;
    dialog.confirm.mockReturnValue(new Promise(resolve => accept = resolve));
    const first = c.upload(); await c.upload();
    expect(dialog.confirm).toHaveBeenCalledTimes(1); accept(true); await first;
    expect(docs.uploadDocument).toHaveBeenCalledTimes(1);
  });
  it('preserves the period confirmed even if controls change before confirmation resolves', async () => {
    const { c, docs, dialog } = setup(); let accept!: (ok: boolean) => void;
    dialog.confirm.mockReturnValue(new Promise(resolve => accept = resolve));
    const pending = c.upload(); c.year = 2027; c.month = 1; accept(true); await pending;
    const fd = docs.uploadDocument.mock.calls[0][0] as FormData;
    expect(fd.get('periodYear')).toBe('2026'); expect(fd.get('periodMonth')).toBe('10');
  });
  it('shows the same submission source in the branch, CRM and client views', () => {
    const api = { listBranchDocs: vi.fn().mockReturnValue(of({data: [], total:0})), listCrmDocs: vi.fn().mockReturnValue(of({data: [], total:0})), listClientDocs: vi.fn().mockReturnValue(of({data: [], total:0})) };
    const c = new ComplianceDocumentRecordsComponent(api as any, {} as any, {} as any, { markForCheck: vi.fn() } as any);
    c.branch = true; c.branchId = 'branch-a'; c.load(); expect(api.listBranchDocs).toHaveBeenCalledWith(expect.objectContaining({branchId:'branch-a'}));
    c.branch = false; c.crm = true; c.companyId = 'company-a'; c.load(); expect(api.listCrmDocs).toHaveBeenCalledWith(expect.objectContaining({companyId:'company-a'}));
    c.crm = false; c.load(); expect(api.listClientDocs).toHaveBeenCalled();
  });
});
