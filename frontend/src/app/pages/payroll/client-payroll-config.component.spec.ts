import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ClientPayrollConfigComponent } from './client-payroll-config.component';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { PayrollEngineApiService } from './payroll-engine-api.service';
import { PayrollApiService } from './payroll-api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ClientContextService } from '../../core/client-context.service';

function harness(api: any = {}) {
  const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
  const component = new ClientPayrollConfigComponent(api, {} as any, toast as any, { markForCheck: vi.fn() } as any, {} as any);
  component.selectedClientId = 'client';
  return { component, toast };
}

describe('client payroll configuration', () => {
  it.each([390, 1440])('renders readable history at %s pixels', async width => {
    await page.viewport(width, 900);
    await TestBed.configureTestingModule({
      imports: [ClientPayrollConfigComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ clientId: 'client' }) }, paramMap: of(convertToParamMap({ clientId: 'client' })) } },
        { provide: PayrollApiService, useValue: { getAssignedClients: () => of([]) } },
        { provide: ClientContextService, useValue: { resolve: () => of(null) } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), info: vi.fn() } },
        { provide: PayrollEngineApiService, useValue: { listClientStructures: () => of([]), listStructures: () => of([]), listRuleSets: () => of([]), getConfigHistory: () => of([
          { id: 'change', createdAt: '2026-09-27T06:00:00Z', action: 'UPDATE', description: 'Basic pay override', oldValues: { displayOrder: 7 }, newValues: { displayOrder: 3 } },
        ]) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ClientPayrollConfigComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b => b.textContent?.trim() === 'Override History')!;
    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const section = fixture.nativeElement.querySelector('[aria-label="Override history"]') as HTMLElement;
    expect(section.textContent).toContain('11:30 IST');
    section.querySelector('summary')!.click();
    expect(section.textContent).toContain('Display order: 7');
    expect(section.getBoundingClientRect().width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `__screenshots__/payroll-config-history-${width}.png` });
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('keeps loading until legacy structures resolve', () => {
    const legacy = new Subject<any[]>();
    const { component } = harness({ listClientStructures: () => of([]), listStructures: () => legacy, listRuleSets: () => of([]) });
    component.loadStructures();
    expect(component.loading).toBe(true);
    legacy.next([]); legacy.complete();
    expect(component.loading).toBe(false);
    expect(component.structuresError).toBe(false);
  });

  it('shows failed legacy loading as unavailable and recovers on retry', () => {
    const listStructures = vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of([]));
    const { component } = harness({ listClientStructures: () => of([]), listStructures, listRuleSets: () => of([]) });
    component.loadStructures();
    expect(component.structuresError).toBe(true);
    expect(component.loading).toBe(false);
    component.loadStructures();
    expect(component.structuresError).toBe(false);
  });

  it('discards stale overrides and disallows saving after a failed reload', () => {
    const saveComponentOverrides = vi.fn();
    const { component } = harness({ getEffectiveComponents: () => throwError(() => new Error('offline')), saveComponentOverrides });
    component.overrides = [{ componentId: 'old' }] as any;
    component.overrideDirty.add('old');
    component.loadOverrides(); component.saveOverrides();
    expect(component.overrides).toEqual([]);
    expect(component.overridesError).toBe(true);
    expect(saveComponentOverrides).not.toHaveBeenCalled();
  });

  it('sends resets without replacing unchanged settings with effective defaults', () => {
    const saveComponentOverrides = vi.fn().mockReturnValue(of([]));
    const { component } = harness({ saveComponentOverrides });
    component.overrides = [{ componentId: 'id', code: 'BASIC', name: 'Base pay', formula: 'GROSS * 0.5', displayOrder: 1, showOnPayslip: true }] as any;
    component.overrideEdits = { id: { labelOverride: '', formulaOverride: '', displayOrder: null, showOnPayslip: true } };
    component.overrideDirty.add('id');
    component.saveOverrides();
    expect(saveComponentOverrides).toHaveBeenCalledWith('client', [{ componentId: 'id', labelOverride: null, formulaOverride: null, displayOrder: null }]);
  });

  it('distinguishes unavailable history from an empty history', () => {
    const getConfigHistory = vi.fn().mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of([]));
    const { component } = harness({ getConfigHistory });
    component.openHistory(); expect(component.historyError).toBe(true);
    component.openHistory(); expect(component.historyError).toBe(false);
    expect(component.history).toEqual([]);
  });
});
