import '@angular/compiler';
import { Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { ThreadAttachmentComponent } from '../components/thread/thread-attachment.component';

function setup() {
  const pending = new Subject<void>();
  const files = { download: vi.fn(() => pending) };
  const c = new ThreadAttachmentComponent(files as any, { markForCheck: vi.fn() } as any);
  c.url = '/TEST-ONLY/file.pdf';
  c.fileName = 'TEST.pdf';
  c.contextId = 'TEST-MESSAGE';
  return { c, files, pending };
}
it('prevents duplicate downloads until the pending request finishes', () => {
  const { c, files, pending } = setup();
  c.download();
  c.download();
  expect(files.download).toHaveBeenCalledOnce();
  expect(c.downloading).toBe(true);
  pending.next();
  expect(c.downloading).toBe(false);
  expect(pending.observed).toBe(false);
});
it('shows a recoverable error and sends the original filename on retry', () => {
  const { c, files, pending } = setup();
  c.download();
  pending.error(new Error('TEST failure'));
  expect(c.downloadError).toContain('TEST.pdf');
  expect(c.downloadError).toContain('Try again');
  expect(c.downloading).toBe(false);
  const retry = new Subject<void>();
  files.download.mockReturnValueOnce(retry);
  c.download();
  expect(c.downloadError).toBe('');
  expect(files.download).toHaveBeenLastCalledWith('/TEST-ONLY/file.pdf', 'TEST.pdf');
  retry.next();
  expect(c.downloading).toBe(false);
});
it('cancels a pending file when another attachment replaces it', () => {
  const { c, pending } = setup();
  c.download();
  c.url = '/TEST-ONLY/other.pdf';
  c.ngOnChanges();
  expect(pending.observed).toBe(false);
  expect(c.downloading).toBe(false);
  pending.error(new Error('TEST stale'));
  expect(c.downloadError).toBe('');
});
it('clears a previous failure when the message context changes', () => {
  const { c, pending } = setup();
  c.download();
  pending.error(new Error('TEST denied'));
  c.contextId = 'TEST-OTHER';
  c.ngOnChanges();
  expect(c.downloadError).toBe('');
});
it('cancels downloading when the conversation is destroyed', () => {
  const { c, files, pending } = setup();
  c.download();
  c.ngOnDestroy();
  expect(pending.observed).toBe(false);
  c.download();
  expect(files.download).toHaveBeenCalledOnce();
});
it('does not request attachments that have no URL', () => {
  const { c, files } = setup();
  c.url = null;
  c.download();
  expect(files.download).not.toHaveBeenCalled();
  expect(c.downloading).toBe(false);
});
it('releases the busy state when a download completes without a value', () => {
  const { c, pending } = setup();
  c.download();
  pending.complete();
  expect(c.downloading).toBe(false);
  expect(c.downloadError).toBe('');
});
it('uses a safe default name for unnamed attachments', () => {
  const { c, files } = setup();
  c.fileName = null;
  c.download();
  expect(files.download).toHaveBeenCalledWith('/TEST-ONLY/file.pdf', 'attachment');
  c.ngOnDestroy();
});
