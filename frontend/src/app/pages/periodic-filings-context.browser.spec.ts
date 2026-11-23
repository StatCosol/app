import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { of, Subject } from 'rxjs';
import { BranchPeriodicUploadsPageComponent } from './branch/branch-periodic-uploads/branch-periodic-uploads-page.component';
import { BranchComplianceDocService, ChecklistItem } from '../core/branch-compliance-doc.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../shared/toast/toast.service';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';
import { SharedFilePreviewModalComponent } from '../shared/components/file-preview';

afterEach(() => TestBed.resetTestingModule());
const item = (code: string, document = false): ChecklistItem => ({
  returnCode: code, returnName: `Synthetic ${code}`, frequency: 'YEARLY', lawArea: 'TEST', category: 'TEST', dueDay: null,
  document: document ? { id: code, status: 'REUPLOAD_REQUIRED', isLocked: false, uploadedFileUrl: `/test/${code}.pdf`, uploadedFileName: `${code}.pdf`, uploadedAt: null, reviewedAt: null, remarks: null, uploaderRemarks: null, version: 1, dueDate: null } : null,
});
const handle = (name: string) => ({ objectUrl: `blob:synthetic-${name}`, mimeType: 'application/pdf', revoke: vi.fn() });
async function setup() {
  const rows = [item('TEST-A', true), item('TEST-B', true)];
  const api = { getChecklist: vi.fn(() => of({ data: rows })), uploadDocument: vi.fn((_form: FormData) => of({})) };
  const files = { fetch: vi.fn(), download: vi.fn(() => of(undefined)) };
  const toast = { error: vi.fn(), success: vi.fn() };
  await TestBed.configureTestingModule({ imports: [BranchPeriodicUploadsPageComponent], providers: [
    provideRouter([]), { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})), queryParamMap: of(convertToParamMap({})), data: of({}) } },
    { provide: BranchComplianceDocService, useValue: api }, { provide: AuthService, useValue: { getBranchIds: () => ['TEST-BRANCH'] } },
    { provide: ProtectedFileService, useValue: files }, { provide: ToastService, useValue: toast },
  ] }).overrideComponent(SharedFilePreviewModalComponent, { set: { template: '' } }).compileComponents();
  const f = TestBed.createComponent(BranchPeriodicUploadsPageComponent); f.detectChanges(); await f.whenStable();
  return { f, c: f.componentInstance, api, files, toast, rows, root: f.nativeElement as HTMLElement };
}

for (const width of [390, 768, 1440]) it(`preserves a newer upload draft when an earlier upload completes at ${width}px`, async () => {
  await page.viewport(width, 900);
  const { f, c, api, rows, root } = await setup();
  const save = new Subject<any>(); api.uploadDocument.mockReturnValueOnce(save);
  c.openUploadModal(rows[0]); c.selectedFile = new File(['synthetic'], 'TEST-A.pdf'); c.submitUpload();
  c.closeUploadModal(); c.openUploadModal(rows[1]);
  const nextFile = new File(['synthetic'], 'TEST-B.pdf'); c.selectedFile = nextFile; c.uploadRemarks = 'Unsaved B draft';
  save.next({}); save.complete(); f.detectChanges(); await f.whenStable();
  expect(c.showUploadModal).toBe(true); expect(c.uploadTarget?.returnCode).toBe('TEST-B');
  expect(c.selectedFile).toBe(nextFile); expect(c.uploadRemarks).toBe('Unsaved B draft');
  expect(root.querySelector('textarea')?.value).toBe('Unsaved B draft');
  expect(root.scrollWidth).toBeLessThanOrEqual(width);
});

it('does not overwrite edits made to the same draft while its upload is pending', async () => {
  const { c, api, rows } = await setup(); const save = new Subject<any>(); api.uploadDocument.mockReturnValueOnce(save);
  c.openUploadModal(rows[0]); c.selectedFile = new File(['synthetic'], 'TEST-A.pdf'); c.uploadRemarks = 'Sent'; c.submitUpload();
  c.uploadRemarks = 'New unsaved correction'; save.next({}); save.complete();
  expect(c.showUploadModal).toBe(true); expect(c.uploadRemarks).toBe('New unsaved correction');
});

for (const field of ['selectedYear', 'selectedQuarter', 'selectedHalf', 'branchId', 'selectedFrequency'] as const) it(`invalidates an upload draft when ${field} changes`, async () => {
  const { c, api, rows } = await setup();
  c.selectedFrequency = field === 'selectedQuarter' ? 'QUARTERLY' : field === 'selectedHalf' ? 'HALF_YEARLY' : 'YEARLY'; c.load();
  c.openUploadModal(rows[0]); c.selectedFile = new File(['synthetic'], 'TEST-old-period.pdf');
  if (field === 'branchId') c.branchId = 'TEST-OTHER'; else if (field === 'selectedFrequency') c.selectedFrequency = 'QUARTERLY'; else c[field] += 1;
  c.load(); c.submitUpload();
  expect(c.showUploadModal).toBe(false); expect(api.uploadDocument).not.toHaveBeenCalled();
});

it('does not refresh a different period or show its predecessor upload notice', async () => {
  const { c, api, rows } = await setup(); const save = new Subject<any>(); api.uploadDocument.mockReturnValueOnce(save);
  c.openUploadModal(rows[0]); c.selectedFile = new File(['synthetic'], 'TEST.pdf'); c.submitUpload();
  c.selectedYear++; c.load(); const calls = api.getChecklist.mock.calls.length;
  save.next({}); save.complete();
  expect(api.getChecklist).toHaveBeenCalledTimes(calls); expect(c.submissionNotice).toBe('');
});

it('preserves selected filing and draft during same-period refresh and recovery', async () => {
  const { c, api, rows } = await setup(); c.selectItem(rows[1]); c.openUploadModal(rows[1]); c.uploadRemarks = 'Keep';
  c.load(); expect(c.selectedItem?.returnCode).toBe('TEST-B'); expect(c.uploadRemarks).toBe('Keep');
  const failed = new Subject<any>(); api.getChecklist.mockReturnValueOnce(failed); c.load(); failed.error(new Error('synthetic outage'));
  expect(c.uploadRemarks).toBe('Keep'); c.load(); expect(c.selectedItem?.returnCode).toBe('TEST-B');
});

it('does not upload against an outdated unlocked checklist item', async () => {
  const { c, api, rows } = await setup(); c.openUploadModal(rows[0]); c.selectedFile = new File(['synthetic'], 'TEST.pdf');
  const locked = { ...rows[0], document: { ...rows[0].document!, isLocked: true } };
  api.getChecklist.mockReturnValueOnce(of({ data: [locked] })); c.load(); c.submitUpload();
  expect(api.uploadDocument).not.toHaveBeenCalled();
});

it('keeps only the latest preview and revokes an obsolete result', async () => {
  const { c, files, rows } = await setup(); const a = new Subject<any>(); const b = new Subject<any>();
  files.fetch.mockReturnValueOnce(a).mockReturnValueOnce(b); c.previewFile(rows[0]); c.previewFile(rows[1]);
  const bh = handle('B'); b.next(bh); const ah = handle('A'); a.next(ah);
  expect(c.previewData?.id).toBe('TEST-B'); expect(ah.revoke).toHaveBeenCalledOnce();
});

it('downloads the previewed document even if the selected filing differs', async () => {
  const { c, files, rows } = await setup(); files.fetch.mockReturnValueOnce(of(handle('B')));
  c.selectItem(rows[0]); c.previewFile(rows[1]); c.downloadPreviewFile();
  expect(files.download).toHaveBeenCalledWith('/test/TEST-B.pdf', 'TEST-B.pdf');
});

it('does not reopen a preview after a period change or after closing it', async () => {
  const { c, files, rows } = await setup(); const a = new Subject<any>(); files.fetch.mockReturnValueOnce(a);
  c.previewFile(rows[0]); c.selectedYear++; c.load(); const ah = handle('A'); a.next(ah);
  expect(c.showPreviewModal).toBe(false); expect(ah.revoke).toHaveBeenCalledOnce();
  const b = new Subject<any>(); files.fetch.mockReturnValueOnce(b); c.previewFile(rows[1]); c.closePreviewModal();
  const bh = handle('B'); b.next(bh); expect(c.showPreviewModal).toBe(false); expect(bh.revoke).toHaveBeenCalledOnce();
});

it('submits the captured filing period and closes only the unchanged successful draft', async () => {
  const { c, api, rows } = await setup(); c.selectedFrequency = 'QUARTERLY'; c.selectedQuarter = 3; c.selectedYear = 2050; c.load();
  c.openUploadModal(rows[1]); c.selectedFile = new File(['synthetic'], 'TEST.pdf'); c.acknowledgementRef = 'TEST-ACK'; c.uploadRemarks = 'Synthetic comment';
  c.submitUpload(); const fd = api.uploadDocument.mock.calls[0][0] as unknown as FormData;
  expect(fd.get('branchId')).toBe('TEST-BRANCH'); expect(fd.get('returnCode')).toBe('TEST-B');
  expect(fd.get('periodYear')).toBe('2050'); expect(fd.get('periodQuarter')).toBe('3'); expect(fd.get('periodHalf')).toBeNull();
  expect(fd.get('remarks')).toBe('AckRef: TEST-ACK | Synthetic comment'); expect(c.showUploadModal).toBe(false); expect(c.uploading).toBe(false);
});

it('retries a checklist failure inside the modal without discarding its file or remarks', async () => {
  const { c, api, rows, f, root } = await setup(); c.openUploadModal(rows[0]);
  const file = new File(['synthetic'], 'TEST-retry.pdf'); c.selectedFile = file; c.uploadRemarks = 'Retain my draft';
  const failed = new Subject<any>(); api.getChecklist.mockReturnValueOnce(failed); c.load(); failed.error(new Error('isolated outage')); f.detectChanges();
  expect((root.querySelector('[aria-label="Submit to CRM"]') as HTMLButtonElement).disabled).toBe(true);
  (root.querySelector('[aria-label="Retry filing checklist"]') as HTMLButtonElement).click(); f.detectChanges();
  expect(c.errorMessage).toBe(''); expect(c.selectedFile).toBe(file); expect(c.uploadRemarks).toBe('Retain my draft');
  expect(c.showUploadModal).toBe(true); expect((root.querySelector('[aria-label="Submit to CRM"]') as HTMLButtonElement).disabled).toBe(false);
});

it('keeps the current draft after an upload failure and permits retry', async () => {
  const { c, api, rows, toast } = await setup(); const failed = new Subject<any>(); api.uploadDocument.mockReturnValueOnce(failed);
  c.openUploadModal(rows[0]); const file = new File(['synthetic'], 'TEST.pdf'); c.selectedFile = file; c.submitUpload(); failed.error(new Error('isolated upload failure'));
  expect(c.selectedFile).toBe(file); expect(c.uploading).toBe(false); expect(c.showUploadModal).toBe(true); expect(toast.error).toHaveBeenCalledWith('Upload failed.');
  c.submitUpload(); expect(api.uploadDocument).toHaveBeenCalledTimes(2); expect(c.showUploadModal).toBe(false);
});

it('does not close a newer same-period draft after switching away and back', async () => {
  const { c, api, rows } = await setup(); const saved = new Subject<any>(); api.uploadDocument.mockReturnValueOnce(saved);
  c.openUploadModal(rows[0]); c.selectedFile = new File(['synthetic'], 'TEST.pdf'); c.submitUpload();
  c.selectedYear++; c.load(); c.selectedYear--; c.load(); c.openUploadModal(rows[1]); c.uploadRemarks = 'New visit';
  const calls = api.getChecklist.mock.calls.length; saved.next({}); saved.complete();
  expect(c.uploadRemarks).toBe('New visit'); expect(c.showUploadModal).toBe(true); expect(api.getChecklist).toHaveBeenCalledTimes(calls);
});

it('releases preview resources on close and ignores obsolete errors', async () => {
  const { c, files, rows, toast } = await setup(); const old = new Subject<any>(); files.fetch.mockReturnValueOnce(old); c.previewFile(rows[0]);
  const current = handle('B'); files.fetch.mockReturnValueOnce(of(current)); c.previewFile(rows[1]); old.error(new Error('obsolete'));
  expect(toast.error).not.toHaveBeenCalled(); c.closePreviewModal(); c.downloadPreviewFile();
  expect(current.revoke).toHaveBeenCalledOnce(); expect(files.download).not.toHaveBeenCalled();
});
