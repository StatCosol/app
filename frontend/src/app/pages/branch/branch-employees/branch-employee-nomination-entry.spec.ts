import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { BranchEmployeeDetailComponent } from './branch-employee-detail.component';

/**
 * The branch desk entering a nomination for one of its employees. The screen
 * could only read nominations before; the form lives here now, and it must not
 * send a nomination with no nominee — those are the records that ended up
 * invisible everywhere (see the nominee repair script).
 */
describe('Branch desk nomination entry', () => {
  type Args = ConstructorParameters<typeof BranchEmployeeDetailComponent>;
  const make = (createNomination = vi.fn(() => of({ id: 'n1' }))) => {
    const svc = { createNomination, listNominations: vi.fn(() => of([])) };
    const toast = { error: vi.fn(), success: vi.fn() };
    const component = new BranchEmployeeDetailComponent(
      svc as unknown as Args[0],
      {} as Args[1],
      { snapshot: { paramMap: { get: () => 'emp-1' } } } as unknown as Args[2],
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as Args[3],
      toast as unknown as Args[4],
      {} as Args[5],
    );
    (component as unknown as { employeeId: string }).employeeId = 'emp-1';
    return { component, svc, toast };
  };

  it('refuses a nomination with no nominee instead of sending it', () => {
    const { component, svc } = make();
    component.openNomForm();
    component.nomForm.nominationType = 'PF';

    component.saveNomination();

    expect(svc.createNomination).not.toHaveBeenCalled();
    expect(component.nomFormError).toBe('At least one nominee member is required');
    expect(component.showNomModal).toBe(true);
  });

  it('requires a nomination type', () => {
    const { component, svc } = make();
    component.openNomForm();
    component.nomForm.members[0].memberName = 'Nampally Lakshmi';

    component.saveNomination();

    expect(svc.createNomination).not.toHaveBeenCalled();
    expect(component.nomFormError).toBe('Nomination type is required');
  });

  it('sends the named nominees for this employee and reloads the list', () => {
    const { component, svc, toast } = make();
    component.openNomForm();
    component.nomForm.nominationType = 'PF';
    component.nomForm.members[0].memberName = 'Nampally Lakshmi';
    component.addNomMember(); // left blank — must not be sent

    component.saveNomination();

    expect(svc.createNomination).toHaveBeenCalledTimes(1);
    const [employeeId, body] = svc.createNomination.mock.calls[0] as unknown as [
      string,
      any,
    ];
    expect(employeeId).toBe('emp-1');
    expect(body.nominationType).toBe('PF');
    expect(body.members.map((m: any) => m.memberName)).toEqual(['Nampally Lakshmi']);
    expect(component.showNomModal).toBe(false);
    expect(toast.success).toHaveBeenCalled();
    expect(svc.listNominations).toHaveBeenCalled();
  });

  it('keeps the form open and shows why when the server refuses', () => {
    const { component } = make(
      vi.fn(() => throwError(() => ({ error: { message: 'Nominee details are required' } }))),
    );
    component.openNomForm();
    component.nomForm.nominationType = 'PF';
    component.nomForm.members[0].memberName = 'Nampally Lakshmi';

    component.saveNomination();

    expect(component.showNomModal).toBe(true);
    expect(component.nomFormError).toContain('Nominee details are required');
  });
});
