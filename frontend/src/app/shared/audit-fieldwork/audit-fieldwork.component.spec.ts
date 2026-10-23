import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { AuditFieldworkComponent } from './audit-fieldwork.component';
const point = (id = 'p', revision = 1) => ({
  id,
  itemLabel: 'Emergency exit',
  kind: 'SITE_INSPECTION',
  status: 'UPLOADED',
  revision,
  evidence: [],
  history: [],
  remarks: '',
});
const response = (items = [point()]) => ({ audit: { id: 'a' }, items, canEdit: true });
function setup() {
  const http = { get: vi.fn(() => of(response())), post: vi.fn(() => of({ saved: true })) };
  const files = { fetch: vi.fn(), open: vi.fn(), download: vi.fn() };
  const c = new AuditFieldworkComponent(
    http as any,
    files as any,
    { markForCheck: vi.fn() } as any,
  );
  c.auditId = 'a';
  c.auditor = true;
  c.ngOnChanges();
  return { c, http, files };
}
describe('Audit fieldwork', () => {
  it('retains unfinished remarks when switching points or refreshing', () => {
    const { c, http } = setup();
    http.get.mockReturnValue(of(response([point(), point('p2')])));
    c.load();
    c.draft.remarks = 'Draft inspection notes';
    c.select(c.items[1]);
    c.select(c.items[0]);
    c.load();
    expect(c.draft.remarks).toBe('Draft inspection notes');
    c.ngOnDestroy();
  });
  it('submits the evidence revision seen by the auditor', () => {
    const { c, http } = setup();
    c.draft.remarks = 'Exit verified on site';
    c.draft.decision = 'COMPLIED';
    c.saveReview();
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/items/p/review'),
      expect.objectContaining({
        revision: 1,
        remarks: 'Exit verified on site',
        decision: 'COMPLIED',
      }),
    );
    c.ngOnDestroy();
  });
  it('keeps review remarks after a conflict and loads the new evidence revision', () => {
    const { c, http } = setup();
    c.draft.remarks = 'Retain these notes';
    http.post.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'New evidence was uploaded' } })) as any,
    );
    http.get.mockReturnValue(of(response([point('p', 2)])));
    c.saveReview();
    expect(c.error).toContain('New evidence');
    expect(c.selected?.revision).toBe(2);
    expect(c.draft.remarks).toBe('Retain these notes');
    c.ngOnDestroy();
  });
  it('discards responses from a previous audit and cancels them', () => {
    const { c, http } = setup();
    const old = new Subject<any>();
    http.get.mockReturnValue(old as any);
    c.load();
    c.auditId = 'b';
    http.get.mockReturnValue(of({ ...response([point('new')]), audit: { id: 'b' } }));
    c.ngOnChanges();
    old.next(response());
    expect(c.audit.id).toBe('b');
    expect(c.selectedId).toBe('new');
    expect(old.observed).toBe(false);
    c.ngOnDestroy();
  });
  it('prevents uploads and verification in a read-only audit', () => {
    const { c, http } = setup();
    c.canEdit = false;
    c.draft.remarks = 'Verified manually';
    c.draft.file = new File(['x'], 'test.txt');
    c.draft.description = 'Supporting record';
    c.saveReview();
    c.upload();
    expect(http.post).not.toHaveBeenCalled();
    c.ngOnDestroy();
  });
  it('rejects empty remarks before posting', () => {
    const { c, http } = setup();
    c.saveReview();
    expect(http.post).not.toHaveBeenCalled();
    expect(c.error).toContain('remarks');
    c.ngOnDestroy();
  });
  it('filters inspection points and corrections without dropping drafts', () => {
    const { c, http } = setup();
    http.get.mockReturnValue(
      of(response([point(), { ...point('p2'), kind: 'DOCUMENT', status: 'NON_COMPLIED' }])),
    );
    c.load();
    c.filter = 'NON_COMPLIED';
    expect(c.visible.map((i) => i.id)).toEqual(['p2']);
    c.filter = 'SITE_INSPECTION';
    expect(c.visible.map((i) => i.id)).toEqual(['p']);
    c.ngOnDestroy();
  });
  it('requires a fresh decision and suggestion confirmation for replacement evidence', () => {
    const { c, http } = setup();
    c.draft.remarks = 'Notes to retain';
    c.draft.decision = 'COMPLIED';
    c.draft.verified = true;
    http.get.mockReturnValue(of(response([point('p', 2)])));
    c.load();
    expect(c.draft.remarks).toBe('Notes to retain');
    expect(c.draft.decision).toBe('PENDING');
    expect(c.draft.verified).toBe(false);
    c.ngOnDestroy();
  });
  it('does not reopen a closed preview or replace a newer photo with a slow response', () => {
    const { c, files } = setup();
    const first = new Subject<any>(),
      second = new Subject<any>();
    files.fetch.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const a = { url: '/a', fileName: 'a.png', mimeType: 'image/png' } as any;
    c.view(a);
    c.view({ ...a, fileName: 'b.png' });
    const old = { revoke: vi.fn() },
      latest = { revoke: vi.fn() };
    second.next(latest);
    first.next(old);
    expect(c.preview).toBe(latest);
    expect(old.revoke).toHaveBeenCalledOnce();
    c.closePreview();
    expect(latest.revoke).toHaveBeenCalledOnce();
    c.ngOnDestroy();
  });
  it('clears the native file chooser and rejects an oversize replacement', () => {
    const { c } = setup();
    const input = { files: [new File(['x'], 'record.txt')], value: 'record.txt' };
    c.fileChanged({ target: input } as any);
    expect(input.value).toBe('');
    expect(c.draft.file?.name).toBe('record.txt');
    c.fileChanged({
      target: { files: [{ size: 10 * 1024 * 1024 + 1 }], value: 'large.pdf' },
    } as any);
    expect(c.draft.file).toBeNull();
    c.ngOnDestroy();
  });
  it('prevents client review and adding points even if called outside the visible buttons', () => {
    const { c, http } = setup();
    c.auditor = false;
    c.newLabel = 'New inspection';
    c.draft.remarks = 'Client cannot verify';
    c.addPoint();
    c.saveReview();
    expect(http.post).not.toHaveBeenCalled();
    c.ngOnDestroy();
  });
  it('adds missing points while preserving unsaved remarks and current selection', () => {
    const { c, http } = setup();
    c.availablePoints = 5;
    c.draft.remarks = 'Keep my unfinished inspection';
    http.post.mockReturnValue(of({ created: 5 }) as any);
    http.get.mockReturnValue(
      of({ ...response([point(), point('new')]), availablePoints: 0 }) as any,
    );
    c.refreshChecklist();
    expect(http.post).toHaveBeenCalledWith(expect.stringContaining('/checklist/refresh'), {});
    expect(c.selectedId).toBe('p');
    expect(c.draft.remarks).toBe('Keep my unfinished inspection');
    expect(c.message).toContain('5 missing audit points');
    expect(c.availablePoints).toBe(0);
    c.ngOnDestroy();
  });
  it('prevents clients and locked/loading audits from refreshing checklists', () => {
    const { c, http } = setup();
    c.availablePoints = 5;
    c.auditor = false;
    c.refreshChecklist();
    c.auditor = true;
    c.canEdit = false;
    c.refreshChecklist();
    c.canEdit = true;
    c.loading = true;
    c.refreshChecklist();
    c.loading = false;
    c.availablePoints = 0;
    c.refreshChecklist();
    expect(http.post).not.toHaveBeenCalled();
    c.ngOnDestroy();
  });
  it('filters document checks and not-applicable decisions', () => {
    const { c, http } = setup();
    http.get.mockReturnValue(
      of(response([point(), { ...point('doc'), kind: 'DOCUMENT', status: 'NOT_APPLICABLE' }])),
    );
    c.load();
    c.filter = 'DOCUMENT';
    expect(c.visible.map((i) => i.id)).toEqual(['doc']);
    c.filter = 'NOT_APPLICABLE';
    expect(c.visible.map((i) => i.id)).toEqual(['doc']);
    c.ngOnDestroy();
  });
});
