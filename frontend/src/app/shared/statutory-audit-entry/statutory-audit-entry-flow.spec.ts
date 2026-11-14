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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockConfirm(answer: boolean) {
  const confirm = vi.fn(() => answer);
  if (typeof window === 'undefined') vi.stubGlobal('window', { confirm });
  else vi.spyOn(window, 'confirm').mockImplementation(confirm);
  return confirm;
}

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
  it('preserves an unsaved review reason when refreshing the same document version', async () => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.documents['point'] = {
      id: 'doc',
      item_id: 'point',
      review_version: 2,
      review_remarks: 'Earlier feedback',
    };
    c.reviewRemarks['point'] = 'Please supply the corrected signed copy';
    http.get.mockReturnValue(
      of({ documents: [{ ...c.documents['point'] }], answers: [], auditStatus: 'IN_PROGRESS' }),
    );
    await c.refreshDocuments();
    expect(c.reviewRemarks['point']).toBe('Please supply the corrected signed copy');
    expect(c.documents['point'].review_remarks).toBe('Earlier feedback');
    injector.destroy();
  });
  it.each([
    { id: 'replacement', review_version: 0 },
    { id: 'doc', review_version: 3 },
  ])('does not attach an unsaved review reason to changed document state %j', async (change) => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.documents['point'] = { id: 'doc', item_id: 'point', review_version: 2, review_remarks: '' };
    c.reviewRemarks['point'] = 'Reason for the previously reviewed version';
    http.get.mockReturnValue(
      of({
        documents: [{ ...change, item_id: 'point', review_remarks: 'Current saved feedback' }],
        answers: [],
        auditStatus: 'IN_PROGRESS',
      }),
    );
    await c.refreshDocuments();
    expect(c.reviewRemarks['point']).toBe('Current saved feedback');
    injector.destroy();
  });
  it('refreshes untouched review remarks and removes remarks for absent documents', async () => {
    const { c, http, injector } = setup(AuditorStatutoryEntryComponent);
    c.documents['point'] = {
      id: 'doc',
      item_id: 'point',
      review_version: 2,
      review_remarks: 'Earlier feedback',
    };
    c.reviewRemarks = { point: 'Earlier feedback', removed: 'Old reason' };
    http.get.mockReturnValue(
      of({
        documents: [{ ...c.documents['point'], review_remarks: 'Current feedback' }],
        answers: [],
        auditStatus: 'IN_PROGRESS',
      }),
    );
    await c.refreshDocuments();
    expect(c.reviewRemarks).toEqual({ point: 'Current feedback' });
    injector.destroy();
  });
  it('keeps review remarks when leaving is declined and blocks submission until reviewed', () => {
    const { c, injector } = setup(AuditorStatutoryEntryComponent);
    const confirm = mockConfirm(false);
    c.clientId = 'current-client';
    c.session = {};
    c.items = [{ id: 'point' }] as any;
    c.saved['point'] = { answer: 'Checked', status: 'COMPLIED', remarks: '', version: 1 };
    c.documents['point'] = { id: 'doc', review_remarks: '' };
    c.reviewRemarks['point'] = 'Unsaved reviewer feedback';
    expect(c.canSubmit).toBe(false);
    c.changeContext('clientId', 'different-client');
    expect(confirm).toHaveBeenCalledOnce();
    expect(c.clientId).toBe('current-client');
    expect(c.reviewRemarks['point']).toBe('Unsaved reviewer feedback');
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    c.beforeUnload(event as any);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    c.reviewRemarks['point'] = '';
    expect(c.canSubmit).toBe(true);
    injector.destroy();
  });
  it('clears old document drafts after confirming a scope change', () => {
    const { c, injector } = setup(AuditorStatutoryEntryComponent);
    const confirm = mockConfirm(true);
    c.documents['point'] = { id: 'doc', review_remarks: '' };
    c.reviewRemarks['point'] = 'Previous audit feedback';
    c.changeContext('clientId', 'new-client');
    expect(c.clientId).toBe('new-client');
    expect(c.documents).toEqual({});
    expect(c.reviewRemarks).toEqual({});
    expect(c.canLeave()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
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
