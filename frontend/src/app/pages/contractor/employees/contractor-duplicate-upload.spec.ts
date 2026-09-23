import { vi } from 'vitest';
import { ContractorEmployeesPageComponent } from './contractor-employees-page.component';

/**
 * A worker must not reach the register twice. The server refuses it; the
 * preview says so first, so the file can be put right before it is sent.
 */
describe('Contractor bulk upload — the same worker twice', () => {
  let component: ContractorEmployeesPageComponent;

  beforeEach(() => {
    type Args = ConstructorParameters<typeof ContractorEmployeesPageComponent>;
    component = new ContractorEmployeesPageComponent(
      {} as Args[0], {} as Args[1],
      { success: vi.fn(), error: vi.fn() } as unknown as Args[2],
      {} as Args[3], { markForCheck: vi.fn() } as unknown as Args[4],
    );
    component.availableBranches = [{ id: 'branch-1', branchName: 'Branch 1' }] as any;
    component.bulkBranchId = 'branch-1';
  });

  const row = (over: Record<string, any> = {}) => ({
    name: 'Ravi Kumar', skillCategory: 'UNSKILLED', monthlySalary: 15000,
    aadhaar: '100000000001', pan: 'ABCDE1234F', bankAccount: '1', ...over,
  });

  it('refuses a row repeating an earlier one, by Aadhaar however it is spaced', () => {
    const [first, second] = component['validateBulkRows']([
      row(), row({ name: 'Ravi Kumar Again', aadhaar: '1000 0000 0001' }),
    ]);
    expect(first.errors).toEqual([]);
    expect(second.errors.join(' ')).toContain('Same worker as row 1 of this file');
  });

  it('refuses a repeat by name when neither row carries an Aadhaar', () => {
    const [, second] = component['validateBulkRows']([
      row({ aadhaar: '' }), row({ aadhaar: '' }),
    ]);
    expect(second.errors.join(' ')).toContain('Same worker as row 1');
  });

  it('refuses a worker already on the register, naming them', () => {
    component.allRows = [
      { id: '1', name: 'Ravi Kumar', employeeCode: 'SBS0007', branchId: 'branch-1', aadhaar: '100000000001' },
    ] as any;
    const [byAadhaar] = component['validateBulkRows']([row({ name: 'Someone Else' })]);
    expect(byAadhaar.errors.join(' ')).toContain('This Aadhaar is already registered to Ravi Kumar (SBS0007)');
    const [byName] = component['validateBulkRows']([row({ aadhaar: '' })]);
    expect(byName.errors.join(' ')).toContain('Ravi Kumar (SBS0007) is already registered at this branch');
  });

  it('lets two different workers through', () => {
    component.allRows = [
      { id: '1', name: 'Someone Else', employeeCode: 'SBS0001', branchId: 'branch-1', aadhaar: '100000000009' },
    ] as any;
    const rows = component['validateBulkRows']([row(), row({ name: 'Sita Devi', aadhaar: '100000000002' })]);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });
});
