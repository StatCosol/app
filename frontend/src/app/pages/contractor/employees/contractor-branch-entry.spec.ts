import { ContractorEmployeesPageComponent } from './contractor-employees-page.component';
describe('Branch worker entry', () => {
  it('flags mixed-branch rows and revalidates changed scope', () => {
    const c = new ContractorEmployeesPageComponent({} as any, {} as any, {} as any, {} as any, { markForCheck: () => {} } as any);
    c.availableBranches = [{ id: 'one' }, { id: 'two' }] as any;
    c.openAdd(); expect(c.form.branchId).toBe('');
    c.bulkPreview = [{ raw: { branchId: 'one' } }] as any;
    c.bulkBranchId = 'two'; c.revalidateBulkBranch();
    expect(c.bulkPreview[0].errors).toContain('Row branch differs from the selected upload branch');
    c.bulkBranchId = 'one'; c.revalidateBulkBranch();
    expect(c.bulkPreview[0].errors).not.toContain('Row branch differs from the selected upload branch');
  });
});
