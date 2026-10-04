import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { PayrollStructuresComponent } from './payroll-structures.component';
import { PayrollEngineApiService, SalaryStructure } from './payroll-engine-api.service';

function setup() {
  const http = {
    put: vi.fn((_url: string, _body: unknown) => of({ id: 'structure' })),
    post: vi.fn((_url: string, _body: unknown) => of({ id: 'structure' })),
  };
  const api = new PayrollEngineApiService(http as any);
  const toast = { success: vi.fn(), error: vi.fn() };
  const component = new PayrollStructuresComponent(
    api, {} as any, {} as any, {} as any, toast as any,
    {} as any, { markForCheck: vi.fn() } as any, {} as any,
  );
  vi.spyOn(component as unknown as { refreshStructures(id: string): void }, 'refreshStructures')
    .mockImplementation(() => {});
  component.selectedClientId = 'logiq';
  component.openEditStructure({
    id: 'structure', clientId: 'logiq', name: 'Standard Structure', scopeType: 'TENANT',
    effectiveFrom: '2026-09-01', effectiveTo: null, ruleSetId: 'standard-rules',
    branchId: null, departmentId: null, gradeId: null, employeeId: null,
    approvalStatus: 'APPROVED', isActive: true,
  } as SalaryStructure);
  return { component, api, http, toast };
}

describe('Payroll structure save contract', () => {
  it('saves edited dates without sending immutable clientId or read-only structure fields', () => {
    const { component, http, toast } = setup();
    component.structureForm.effectiveFrom = '2026-10-01';
    component.saveStructure();
    expect(http.put).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/structures\/structure$/), {
      name: 'Standard Structure', scopeType: 'TENANT', effectiveFrom: '2026-10-01',
      effectiveTo: null, ruleSetId: 'standard-rules',
      branchId: null, departmentId: null, gradeId: null, employeeId: null,
    });
    expect(http.post).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Structure updated');
    expect(component.showStructureModal).toBe(false);
    expect(component.saving).toBe(false);
    component.ngOnDestroy();
  });

  it('still includes the selected client when creating a structure', () => {
    const { component, http } = setup();
    component.editingStructure = null;
    component.saveStructure();
    expect(http.post).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/structures$/), expect.objectContaining({ clientId: 'logiq', name: 'Standard Structure' }));
    expect(http.put).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('preserves activation-only updates', () => {
    const { api, http, component } = setup();
    api.updateStructure('structure', { isActive: true }).subscribe();
    expect(http.put).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/structures\/structure$/), { isActive: true });
    component.ngOnDestroy();
  });
});
