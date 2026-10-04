import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { PayrollStructuresComponent } from './payroll-structures.component';
import { PayrollEngineApiService, RuleSet, SalaryStructure } from './payroll-engine-api.service';

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

describe('Selected structure calculation preview', () => {
  function previewSetup() {
    const fixture = setup();
    fixture.component.selectedStructure = fixture.component.editingStructure;
    fixture.component.previewForm = { grossAmount: 25000, asOfDate: '2026-10-04', branchId: 'branch', employeeId: 'employee', workedDays: 24.5, payableDays: 26 };
    fixture.component.components = [
      { code: 'BASIC', componentType: 'EARNING' },
      { code: 'CUSTOM_DEDUCTION', componentType: 'DEDUCTION' },
      { code: 'CUSTOM_EMPLOYER', componentType: 'EMPLOYER' },
      { code: 'EPS_WAGES', componentType: 'INFO' },
    ] as any;
    return fixture;
  }

  it('previews the selected saved version and keeps internal inputs out of earnings', () => {
    const { component, http } = previewSetup();
    http.post.mockReturnValueOnce(of({ ACTUAL_GROSS: 25000, BASIC: 25000, MIN_WAGE: 13500, EPS_WAGES: 0, PF_EMP: 1800, CUSTOM_DEDUCTION: 200, CUSTOM_EMPLOYER: 500, GROSS: 25000, NET_PAY: 23000 }) as any);
    component.runPreview();
    expect(http.post).toHaveBeenCalledWith(expect.stringMatching(/\/preview$/), expect.objectContaining({ structureId: 'structure', grossAmount: 25000, workedDays: 24.5, payableDays: 26 }));
    expect(component.previewEarnings).toEqual([{ component: 'BASIC', amount: 25000 }]);
    expect(component.previewTotalEarnings).toBe(25000);
    expect(component.previewTotalDeductions).toBe(2000);
    expect(component.previewEmployer).toEqual([{ component: 'CUSTOM_EMPLOYER', amount: 500 }]);
    expect(component.previewNetPay).toBe(23000);
    component.ngOnDestroy();
  });

  it('clears old results and shows mapping errors without manufacturing net pay', () => {
    const { component, http } = previewSetup();
    component.previewRows = [{ component: 'OLD', amount: 100 }];
    http.post.mockReturnValueOnce(throwError(() => ({ error: { message: 'Add enabled component mappings' } })));
    component.runPreview();
    expect(component.previewRows).toEqual([]);
    expect(component.previewError).toContain('enabled component mappings');
    http.post.mockReturnValueOnce(of({ MIN_WAGE: 13500, EPS_WAGES: 0 }) as any);
    component.runPreview();
    expect(component.previewRows).toEqual([]);
    expect(component.previewError).toContain('complete payroll totals');
    component.ngOnDestroy();
  });

  it('ignores a response after the preview inputs change', () => {
    const { component, http } = previewSetup();
    const pending = new Subject<any>(); http.post.mockReturnValueOnce(pending as any);
    component.runPreview(); component.previewForm.grossAmount = 30000; component.clearPreview();
    pending.next({ BASIC: 25000, GROSS: 25000, NET_PAY: 25000 }); pending.complete();
    expect(component.previewRows).toEqual([]);
    expect(component.previewLoading).toBe(false);
    component.ngOnDestroy();
  });
});

describe('Linked rule set choices', () => {
  it.each(['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Kolkata'])(
    'keeps calendar dates unchanged with the browser timezone set to %s', timeZone => {
      const { component } = setup();
      const nativeFormat = Date.prototype.toLocaleDateString;
      // Emulate the browser's default timezone; an explicit formatter timezone
      // must still take precedence. The old implementation shifts Jan 1 west of UTC.
      const formatter = vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(
        function (this: Date, locales, options) {
          return nativeFormat.call(this, locales, { timeZone, ...options });
        },
      );
      try {
        expect(component.formatDate('2026-01-01')).toBe('01 Jan 2026');
        expect(component.formatDate('2026-09-30')).toBe('30 Sept 2026');
        expect(component.formatDate('2024-02-29')).toBe('29 Feb 2024');
        expect(component.formatDate(null)).toBe('-');
        expect(component.formatDate('invalid')).toBe('-');
        const timestamp = '2026-01-01T00:00:00Z';
        expect(component.formatDate(timestamp)).toBe(nativeFormat.call(new Date(timestamp), 'en-IN', {
          timeZone, day: '2-digit', month: 'short', year: 'numeric',
        }));
      } finally {
        formatter.mockRestore();
        component.ngOnDestroy();
      }
    },
  );

  const rule = (id: string, isActive: boolean): RuleSet => ({
    id, isActive, name: 'Standard Rules', clientId: 'logiq', branchId: null,
    effectiveFrom: '2026-01-01', effectiveTo: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  });

  it('hides unrelated inactive rules while retaining the existing link and exposing history on request', () => {
    const { component } = setup();
    component.ruleSets = [rule('standard-rules', false), rule('older', false), rule('active', true)];
    expect(component.ruleSetOptions.map(r => r.value)).toEqual(['active', 'standard-rules']);
    expect(component.ruleSetOptions.find(r => r.value === 'standard-rules')?.label).toContain('Currently linked');
    component.showInactiveRuleSets = true;
    expect(component.ruleSetOptions.map(r => r.value)).toContain('older');
    expect(component.structureForm.ruleSetId).toBe('standard-rules');
    component.showInactiveRuleSets = false;
    component.structureForm.ruleSetId = 'active';
    expect(component.ruleSetOptions.map(r => r.value)).toContain('standard-rules');
    component.ngOnDestroy();
  });

  it('distinguishes identical names and dates without merging potentially different parameter sets', () => {
    const { component } = setup();
    component.ruleSets = [rule('uuid-two', true), rule('uuid-one', true)];
    const choices = component.ruleSetOptions;
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map(r => r.label)).size).toBe(2);
    expect(choices[0].label).toContain('Entry 1 of 2');
    expect(choices[0].label).not.toContain('uuid');
    component.ruleSets.reverse();
    expect(component.ruleSetOptions).toEqual(choices);
    component.ngOnDestroy();
  });

  it('shows branch, effective dates, and status instead of a name alone', () => {
    const { component } = setup();
    component.branchOptions = [{ id: 'branch', branchName: 'Hyderabad' }];
    component.ruleSets = [{ ...rule('standard-rules', true), branchId: 'branch', effectiveTo: '2026-09-30' }];
    const label = component.ruleSetOptions[0].label;
    expect(label).toContain('Hyderabad'); expect(label).toContain('2026');
    expect(label).toContain('Active'); expect(label).toContain('Currently linked');
    component.ngOnDestroy();
  });

  it('requires an explicit choice for a new structure instead of choosing the first duplicate name', () => {
    const { component } = setup();
    component.ruleSets = [rule('older', false), rule('active', true)];
    component.showInactiveRuleSets = true;
    component.openCreateStructure();
    expect(component.structureForm.ruleSetId).toBe('');
    expect(component.showInactiveRuleSets).toBe(false);
    expect(component.ruleSetOptions.map(r => r.value)).toEqual(['active']);
    component.ngOnDestroy();
  });
});
