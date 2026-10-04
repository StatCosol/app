import { vi } from 'vitest';
import { of } from 'rxjs';
import { BranchEmployeeFormComponent } from './branch-employee-form.component';

describe('Branch Desk intern entry', () => {
  function fixture() {
    type Args = ConstructorParameters<typeof BranchEmployeeFormComponent>;
    const record = {
      id: 'intern-1',
      name: 'Example Intern',
      phone: '+919876543210',
      aadhaar: '123456789012',
      payrollCategory: 'INTERN',
      monthlyGross: '15000.50',
    };
    const svc = {
      create: vi.fn(() => of(record)),
      update: vi.fn(() => of(record)),
      getById: vi.fn(() => of(record)),
    };
    const component = new BranchEmployeeFormComponent(
      svc as unknown as Args[0],
      {} as Args[1],
      { navigate: vi.fn() } as unknown as Args[2],
      {} as Args[3],
      { detectChanges: vi.fn() } as unknown as Args[4],
    );
    return { component, svc, record };
  }

  it('sends an intern category and a numeric stipend when registering', () => {
    const { component, svc, record } = fixture();
    component.form = { ...record };
    component.save();
    expect(svc.create).toHaveBeenCalledWith(
      expect.objectContaining({ payrollCategory: 'INTERN', monthlyGross: 15000.5 }),
    );
  });

  it.each(['', 'abc', 'Infinity', '0', '-10'])('does not save an invalid stipend %s', (stipend) => {
    const { component, svc, record } = fixture();
    component.form = { ...record, monthlyGross: stipend };
    component.save();
    expect(svc.create).not.toHaveBeenCalled();
    expect(component.formError).toContain('positive monthly stipend');
  });

  it('keeps the intern category and stipend when loading and updating', () => {
    vi.useFakeTimers();
    try {
      const { component, svc } = fixture();
      component.employeeId = 'intern-1';
      component.isEdit = true;
      component.loadEmployee();
      expect(component.form.payrollCategory).toBe('INTERN');
      component.form.monthlyGross = '16000';
      component.save();
      expect(svc.update).toHaveBeenCalledWith(
        'intern-1',
        expect.objectContaining({ payrollCategory: 'INTERN', monthlyGross: 16000 }),
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('keeps ordinary new registrations on regular payroll', () => {
    expect(fixture().component.form.payrollCategory).toBe('REGULAR');
  });
});
