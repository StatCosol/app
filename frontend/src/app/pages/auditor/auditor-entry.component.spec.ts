import { of, Subject, throwError } from 'rxjs';
import { AuditorEntryComponent } from './auditor-entry.component';

describe('Conduct Audit entry', () => {
  function setup() {
    const api = { auditorEntryOptions: vi.fn(() => of({
      clients: [{ id: 'client', name: 'Synthetic company' }],
      branches: [{ id: 'branch-a', clientId: 'client' }, { id: 'branch-b', clientId: 'client' }],
      contractors: [{ id: 'contractor', clientId: 'client', branchId: 'branch-a' }], auditTypes: ['CONTRACTOR','FACTORY'],
    })), auditorStartEntry: vi.fn(() => of({ auditId: 'audit' }) as any) };
    const router = { navigate: vi.fn() };
    const component = new AuditorEntryComponent(api as any, router as any, { markForCheck: vi.fn() } as any);
    component.ngOnInit();
    Object.assign(component, { clientId: 'client', branchId: 'branch-a', auditType: 'CONTRACTOR', periodCode: '2026-08', contractorUserId: 'contractor' });
    return { component, api, router };
  }
  it('opens the selected contractor/branch/period and prevents duplicate clicks while opening', () => {
    const { component:c, api, router } = setup(); const request = new Subject(); api.auditorStartEntry.mockReturnValue(request);
    c.start(); c.start();
    expect(api.auditorStartEntry).toHaveBeenCalledTimes(1);
    expect(api.auditorStartEntry).toHaveBeenCalledWith({ clientId:'client',branchId:'branch-a',auditType:'CONTRACTOR',periodCode:'2026-08',contractorUserId:'contractor' });
    request.next({ auditId:'existing-audit' }); request.complete();
    expect(router.navigate).toHaveBeenCalledWith(['/auditor/audits','existing-audit','workspace']);
  });
  it('clears contractor selection when scope changes and requires a matching contractor', () => {
    const { component:c } = setup(); expect(c.canStart).toBe(true);
    c.branchId='branch-b'; c.changeBranch(); expect(c.contractorUserId).toBe(''); expect(c.canStart).toBe(false);
    c.contractorUserId='contractor'; expect(c.canStart).toBe(false);
    c.auditType='FACTORY'; c.changeType(); expect(c.canStart).toBe(true);
    c.changeClient(); expect(c.branchId).toBe(''); expect(c.canStart).toBe(false);
  });
  it('keeps selections after an error and validates the period', () => {
    const { component:c, api } = setup(); api.auditorStartEntry.mockReturnValue(throwError(() => new Error('offline')));
    c.start(); expect(c.error).toContain('could not be opened'); expect(c.periodCode).toBe('2026-08'); expect(c.busy).toBe(false);
    c.periodCode='2026-13'; expect(c.canStart).toBe(false);
  });
});
