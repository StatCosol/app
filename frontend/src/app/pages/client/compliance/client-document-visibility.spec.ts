import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { ClientComplianceLibraryComponent } from './client-compliance-library.component';
import { ClientUnitDocumentsComponent } from '../unit-documents/client-unit-documents.component';
import { ComplianceDocumentRecordsComponent } from '../../../shared/compliance/compliance-document-records.component';

const cdr = { markForCheck: vi.fn(), detectChanges: vi.fn() };
function library(query = {}) {
  const api = { listForClient: vi.fn().mockReturnValue(of([])), getSubCategories: vi.fn().mockReturnValue(of([])) };
  const branches = new Subject<any>();
  const c = new ClientComplianceLibraryComponent({} as any, api as any, {getBranches: () => branches} as any,
    {isMasterUser: () => true, getBranchIds: () => ['assigned-branch']} as any,
    {snapshot: {queryParamMap: convertToParamMap(query)}} as any, {error: vi.fn()} as any, cdr as any);
  return {c, api, branches};
}
function units() {
  const api = {listForClient: vi.fn().mockReturnValue(of([]))};
  const c = new ClientUnitDocumentsComponent({} as any, api as any, {list: () => of([])} as any, {error: vi.fn()} as any, cdr as any);
  return {c, api};
}
describe('client document visibility', () => {
  it('opens the library across all categories and periods, including company files', () => {
    const {c, api, branches} = library(); c.ngOnInit();
    branches.next([{id: 'assigned-branch'}]);
    expect(api.listForClient).toHaveBeenCalledWith({});
    expect(c.filters.branchId).toBe(''); c.loadDocuments();
    expect(api.listForClient).toHaveBeenLastCalledWith({}); c.ngOnDestroy();
  });
  it('preserves a branch/period deep link when the branch dropdown arrives', () => {
    const {c, api, branches} = library({branchId: 'selected-branch', category:'REGISTER', periodYear:'2025'});
    c.ngOnInit(); branches.next([]); c.loadDocuments();
    expect(api.listForClient).toHaveBeenLastCalledWith({branchId:'selected-branch',category:'REGISTER',periodYear:2025}); c.ngOnDestroy();
  });
  it('does not let an old empty category response replace current documents', () => {
    const {c, api} = library(); const old = new Subject<any>(); const current = new Subject<any>();
    api.listForClient.mockReturnValueOnce(old).mockReturnValueOnce(current);
    c.loadDocuments(); c.switchTab('LICENSE'); current.next([{id:'licence'}]); current.complete(); old.next([]); old.complete();
    expect(c.filteredDocs).toEqual([{id:'licence'}]); expect(c.loading).toBe(false); c.ngOnDestroy();
  });
  it('reports a library failure and can retry it', () => {
    const {c, api} = library(); api.listForClient.mockReturnValueOnce(throwError(() => new Error('failed')));
    c.loadDocuments(); expect(c.loadError).toContain('Unable to load'); c.loadDocuments(); expect(c.loadError).toBe(''); c.ngOnDestroy();
  });
  it('requests all submission years when the Client library supplies no year', () => {
    const api = {listClientDocs: vi.fn().mockReturnValue(of({data:[],total:0}))};
    const c = new ComplianceDocumentRecordsComponent(api as any, {} as any, {} as any, cdr as any);
    c.year = null; c.load(); expect(api.listClientDocs).toHaveBeenCalledWith(expect.objectContaining({year:undefined})); c.ngOnDestroy();
  });
  it('cancels an older empty unit response after filters are cleared', () => {
    const {c, api} = units(); const old = new Subject<any>(); const current = new Subject<any>();
    api.listForClient.mockReturnValueOnce(old).mockReturnValueOnce(current);
    c.filters.scope = 'COMPANY'; c.loadDocuments(); c.clearFilters(); current.next([{id:'unit-file'}]); current.complete(); old.next([]); old.complete();
    expect(c.documents).toEqual([{id:'unit-file'}]); expect(c.loading).toBe(false); c.ngOnDestroy();
  });
  it('keeps a unit loading failure distinct from an empty result, and retries', () => {
    const {c, api} = units(); api.listForClient.mockReturnValueOnce(throwError(() => new Error('failed')));
    c.loadDocuments(); expect(c.loadError).toContain('Unable to load unit'); expect(c.loading).toBe(false);
    api.listForClient.mockReturnValueOnce(of([{id:'restored'}])); c.loadDocuments();
    expect(c.loadError).toBe(''); expect(c.documents).toEqual([{id:'restored'}]); c.ngOnDestroy();
  });
});
