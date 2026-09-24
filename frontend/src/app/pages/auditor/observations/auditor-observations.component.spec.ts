import { BehaviorSubject, Subject, of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { AuditorObservationsComponent } from './auditor-observations.component';

describe('AuditXpert corrections workspace', () => {
  function setup() {
    const queries = new BehaviorSubject(convertToParamMap({ auditId: 'audit-a' }));
    const api = { list: vi.fn(() => of([]) as any), listCategories: vi.fn(() => of([])), update: vi.fn(() => of({})), verifyObservationClosure: vi.fn(() => of({})), reopenObservation: vi.fn(() => of({})) };
    const files = { open: vi.fn(() => of(undefined)) };
    const component = new AuditorObservationsComponent(api as any, { auditorListAudits: () => of([]) } as any, { paramMap: of(convertToParamMap({})), queryParamMap: queries } as any, { success: vi.fn(), warning: vi.fn(), error: vi.fn() } as any, { markForCheck: vi.fn() } as any, files as any);
    return { component, queries, api, files };
  }
  it('cancels old audit requests and clears stale selections', () => {
    const x = setup(); const old = new Subject<any[]>(); const latest = new Subject<any[]>();
    x.api.list.mockReturnValueOnce(old).mockReturnValueOnce(latest); x.component.ngOnInit();
    x.component.selected = { id: 'old-a' }; x.queries.next(convertToParamMap({ auditId: 'audit-b' }));
    expect(old.observed).toBe(false); expect(x.component.selected).toBeNull(); expect(x.component.canVerifyClosure).toBe(false);
    latest.next([{ id: 'b', auditId: 'audit-b', status: 'RESOLVED' }]); latest.complete();
    old.next([{ id: 'stale-a' }]); expect(x.component.selected.id).toBe('b'); x.component.ngOnDestroy();
  });
  it('opens a linked observation only inside the loaded assigned scope', () => {
    const x = setup(); x.api.list.mockReturnValue(of([{ id: 'allowed', risk: 'LOW' }]));
    x.queries.next(convertToParamMap({ auditId: 'audit-a', observationId: 'foreign' })); x.component.ngOnInit();
    expect(x.component.selected).toBeNull(); expect(x.component.loadError).toContain('assigned audit scope'); x.component.ngOnDestroy();
  });
  it('prioritizes high risk and selects the next matching correction', () => {
    const x = setup(); x.component.observations = [{ id: 'low', risk: 'LOW', status: 'OPEN' },{ id: 'critical', risk: 'CRITICAL', status: 'RESOLVED' }];
    expect(x.component.filteredRows.map(r => r.id)).toEqual(['critical','low']);
    x.component.chooseStatus('RESOLVED'); expect(x.component.selected.id).toBe('critical');
    x.component.clearFilters(); x.component.nextObservation(); expect(x.component.selected.id).toBe('low');
  });
  it('requires a verification note, keeps closed records read-only, and authenticates evidence', () => {
    const x = setup(); x.component.loading = false; x.component.selected = { id: 'a', status: 'RESOLVED' };
    expect(x.component.canVerifyClosure).toBe(false); x.component.verificationNotes = 'Evidence reviewed'; expect(x.component.canVerifyClosure).toBe(true);
    x.component.selected.status = 'CLOSED'; x.component.saveCapaDetails(); expect(x.api.update).not.toHaveBeenCalled();
    x.component.openEvidence('compliance/evidence.pdf'); expect(x.files.open).toHaveBeenCalledWith('compliance/evidence.pdf');
    x.component.openEvidence('https://example.invalid/private.pdf'); expect(x.files.open).toHaveBeenCalledTimes(1);
  });
});
