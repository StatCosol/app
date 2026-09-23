import { vi } from 'vitest';
import { ContractorEmployeesPageComponent } from './contractor-employees-page.component';

/**
 * A worker is often put on site before their Aadhaar, PAN or bank details are
 * collected. Refusing the row left the worker off the register altogether, so
 * a blank now enrols them with the detail pending and the office chases it.
 */
describe('Contractor enrolment with details pending', () => {
  let component: ContractorEmployeesPageComponent;

  beforeEach(() => {
    type Args = ConstructorParameters<typeof ContractorEmployeesPageComponent>;
    component = new ContractorEmployeesPageComponent(
      {} as Args[0],
      {} as Args[1],
      { success: vi.fn(), error: vi.fn() } as unknown as Args[2],
      {} as Args[3],
      { markForCheck: vi.fn() } as unknown as Args[4],
    );
    component.availableBranches = [{ id: 'branch-1', branchName: 'Branch 1' }] as any;
    component.bulkBranchId = 'branch-1';
  });

  const row = (over: Record<string, any> = {}) => ({
    name: 'Ravi Kumar', skillCategory: 'UNSKILLED', monthlySalary: 15000,
    aadhaar: '100000000001', pan: 'ABCDE1234F', bankAccount: '001234567890', ...over,
  });
  const check = (over: Record<string, any> = {}) => component['validateBulkRows']([row(over)])[0];

  it('uploads a row with all three still to come, and says which', () => {
    const r = check({ aadhaar: '', pan: null, bankAccount: undefined });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toContain('Aadhaar, PAN, bank account pending');
  });

  it('names only what is actually missing', () => {
    expect(check({ pan: '' }).warnings.join(' ')).toContain('PAN pending');
    expect(check({ pan: '' }).warnings.join(' ')).not.toContain('Aadhaar');
    expect(check().warnings).toEqual([]);
  });

  it('still rejects a detail that is filled in wrongly', () => {
    expect(check({ aadhaar: '12345' }).errors.join(' ')).toContain('Aadhaar must contain 12 digits');
    expect(check({ pan: 'ABCD1234F' }).errors.join(' ')).toContain('PAN must use the format');
  });

  it('counts and filters the workers who still owe something', () => {
    component.allRows = [
      { name: 'A', isActive: true, aadhaar: '100000000001', pan: 'ABCDE1234F', bankAccount: '1' },
      { name: 'B', isActive: true, aadhaar: '', pan: 'ABCDE1234F', bankAccount: '1' },
      { name: 'C', isActive: true, aadhaar: '100000000002', pan: null, bankAccount: null },
    ] as any;
    expect(component.detailsPendingCount).toBe(2);
    expect(component.pendingDetails(component.allRows[2])).toEqual(['PAN', 'Bank a/c']);
    component.onlyDetailsPending = true;
    component.applyFilters();
    expect(component.filteredRows.map((r) => r.name)).toEqual(['B', 'C']);
    component.onlyDetailsPending = false;
    component.applyFilters();
    expect(component.filteredRows).toHaveLength(3);
  });
});
