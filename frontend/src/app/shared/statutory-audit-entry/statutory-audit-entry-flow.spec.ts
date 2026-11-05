import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedFileService } from '../files/services/protected-file.service';
import { AuditorStatutoryEntryComponent } from '../../pages/auditor/auditor-statutory-entry.component';
import { AuditeeAuditDocumentsComponent } from './auditee-audit-documents.component';

function setup<T>(type: new () => T) {
  const http = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
  const injector = createEnvironmentInjector(
    [
      { provide: HttpClient, useValue: http },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      { provide: ProtectedFileService, useValue: { download: vi.fn(() => of(null)) } },
    ],
    null as any,
  );
  const c = runInInjectionContext(injector, () => new type());
  return { c, http, injector };
}
afterEach(() => vi.unstubAllGlobals());

describe('Audit entry browser flow', () => {
  it('does not count unsaved answers toward submission', () => {
    const { c, injector } = setup(AuditorStatutoryEntryComponent);
    c.session = {};
    c.items = [{ id: 'point' }] as any;
    c.drafts['point'] = { answer: 'Checked', status: 'COMPLIED', remarks: '', version: 0 };
    c.edit('point');
    expect(c.completed).toBe(0);
    expect(c.canSubmit).toBe(false);
    injector.destroy();
  });
  it('preserves edits when optimistic concurrency rejects a save', async () => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.drafts['point'] = { answer: 'My finding', status: 'COMPLIED', remarks: '', version: 1 };
    c.edit('point');
    http.put.mockReturnValue(throwError(() => ({ error: { message: 'Reload before saving' } })));
    await c.save({ id: 'point', serial: 1 } as any);
    expect(c.drafts['point'].answer).toBe('My finding');
    expect(c.dirty.has('point')).toBe(true);
    expect(c.error).toBe('Reload before saving');
    expect(c.busy).toBe(false);
    injector.destroy();
  });
  it('marks saved conclusions stale after auditee uploads change without discarding drafts', async () => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.saved['point'] = { answer: 'Original', status: 'COMPLIED', remarks: '', version: 1 };
    c.drafts['point'] = { ...c.saved['point'], answer: 'Unsaved follow-up' };
    http.get.mockReturnValue(
      of({
        documents: [{ item_id: 'point', id: 'new', review_status: 'PENDING' }],
        answers: [{ item_id: 'point', stale: true }],
        auditStatus: 'IN_PROGRESS',
      }),
    );
    await c.refreshDocuments();
    expect(c.completed).toBe(0);
    expect(c.drafts['point'].answer).toBe('Unsaved follow-up');
    expect(c.dirty.has('point')).toBe(true);
    expect(c.documents['point'].id).toBe('new');
    injector.destroy();
  });
  it('sends the selected audit mode and category scope', async () => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.auditId = 'audit';
    c.auditMode = 'ONLINE';
    c.scope = ['Factory category'];
    c.auditeeName = 'Auditee';
    c.scopeAcknowledged = true;
    http.post.mockReturnValue(of({}));
    http.get.mockReturnValue(
      of({ session: {}, items: [], answers: [], evidence: [], documents: [] }),
    );
    await c.configure();
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/audit/scope'),
      expect.objectContaining({
        auditMode: 'ONLINE',
        categories: ['Factory category'],
        scopeAcknowledged: true,
      }),
    );
    injector.destroy();
  });
  it('requires resaving a conclusion after a document review', async () => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.documents['point'] = { id: 'doc', review_version: 2 };
    c.saved['point'] = {} as any;
    c.reviewRemarks['point'] = 'Document checked';
    http.put.mockReturnValue(of({ version: 3 }));
    await c.reviewDocument({ id: 'point' } as any, 'APPROVED');
    expect(c.saved['point']).toBeUndefined();
    expect(c.dirty.has('point')).toBe(true);
    expect(c.documents['point'].review_version).toBe(3);
    injector.destroy();
  });
  it('shows auditee feedback and upload locks on refresh', async () => {
    const { c, http, injector } = setup(AuditeeAuditDocumentsComponent);
    http.get.mockReturnValue(
      of({
        items: [{ id: 'point', category: 'Category' }],
        documents: [
          { item_id: 'point', review_status: 'REJECTED', review_remarks: 'Supply signed copy' },
        ],
        uploadLocked: true,
        readonly: false,
      }),
    );
    await c.refresh();
    c.status = 'REJECTED';
    expect(c.filtered).toHaveLength(1);
    expect(c.documents['point'].review_remarks).toBe('Supply signed copy');
    expect(c.locked).toBe(true);
    injector.destroy();
  });
});
