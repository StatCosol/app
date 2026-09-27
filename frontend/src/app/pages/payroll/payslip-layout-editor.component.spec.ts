import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { PayrollEngineApiService, PayslipLayout } from './payroll-engine-api.service';
import { PayslipLayoutEditorComponent } from './payslip-layout-editor.component';

function layout(): PayslipLayout {
  return { sections: [
    { key: 'EARNINGS', title: 'Earnings', rows: [], totals: [{ type: 'TOTAL', key: 'GROSS_EARNINGS', label: 'Gross Earnings' }] },
    { key: 'DEDUCTIONS', title: 'Deductions', rows: [], totals: [{ type: 'TOTAL', key: 'TOTAL_DEDUCTIONS', label: 'Total Deductions' }] },
    { key: 'SUMMARY', title: 'Summary', rows: [{ type: 'TOTAL', key: 'NET_PAY', label: 'Net Pay' }] },
  ], settings: { showRates: false, showUnits: false, currency: 'INR' } };
}
describe('Payslip layout editor', () => {
  const components = [{ code: 'BASIC', name: 'Basic salary', enabled: true }, { code: 'HRA', name: 'Housing allowance', enabled: true }, { code: 'OLD', name: 'Disabled', enabled: false }];
  let api: { getPayslipLayout: ReturnType<typeof vi.fn>; getEffectiveComponents: ReturnType<typeof vi.fn>; savePayslipLayout: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { getPayslipLayout: vi.fn(() => of(layout())), getEffectiveComponents: vi.fn(() => of(components)), savePayslipLayout: vi.fn((_client, saved) => of(saved)) };
    await TestBed.configureTestingModule({ imports: [PayslipLayoutEditorComponent], providers: [{ provide: PayrollEngineApiService, useValue: api }] }).compileComponents();
  });
  afterEach(() => TestBed.resetTestingModule());
  function fixture() {
    const f = TestBed.createComponent(PayslipLayoutEditorComponent);
    f.componentRef.setInput('clientId', 'client-a'); f.detectChanges(); return f;
  }
  it('renders the existing layout as disabled until the user enables it', async () => {
    const f = fixture(); await f.whenStable(); f.detectChanges();
    expect(f.componentInstance.layout?.settings.enabled).toBe(false);
    expect(f.nativeElement.querySelector('input[type=checkbox]').checked).toBe(false);
    expect(f.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    expect(f.nativeElement.querySelector('[aria-label="EARNINGS total label"]').value).toBe('Gross Earnings');
  });
  it('adds, reorders and removes components without removing mandatory totals', () => {
    const c = fixture().componentInstance; const section = c.layout!.sections[0];
    c.selected['EARNINGS'] = 'BASIC'; c.add(section);
    c.selected['EARNINGS'] = 'HRA'; c.add(section);
    c.move(section.rows, 1, -1);
    expect(section.rows.map(r => r.type === 'COMPONENT' ? r.code : '')).toEqual(['HRA', 'BASIC']);
    expect(c.available()).toHaveLength(0);
    c.remove(section.rows, 0); expect(c.available().map(r => r.code)).toEqual(['HRA']);
    c.remove(c.layout!.sections[2].rows, 0); expect(c.layout!.sections[2].rows).toHaveLength(1);
    c.layout!.settings.enabled = true; c.save();
    expect(api.savePayslipLayout).toHaveBeenCalledWith('client-a', expect.objectContaining({ settings: expect.objectContaining({ enabled: true }) }));
    expect(c.dirty).toBe(false); expect(c.message).toBe('Layout saved');
  });
  it('keeps edits when saving fails and allows retry', () => {
    const c = fixture().componentInstance;
    api.savePayslipLayout.mockReturnValueOnce(throwError(() => new Error('offline')));
    c.layout!.sections[0].title = 'Salary'; c.changed(); c.save();
    expect(c.dirty).toBe(true); expect(c.saving).toBe(false); expect(c.error).toContain('could not be saved');
    expect(c.layout!.sections[0].title).toBe('Salary'); c.save(); expect(c.message).toBe('Layout saved');
  });
  it('ignores a stale load from the previous client', () => {
    const first = new Subject<PayslipLayout>(); api.getPayslipLayout.mockReturnValueOnce(first);
    const f = fixture(); expect(f.componentInstance.loading).toBe(true);
    f.componentRef.setInput('clientId', 'client-b'); f.detectChanges();
    const stale = layout(); stale.sections[0].title = 'Wrong client'; first.next(stale); first.complete();
    expect(f.componentInstance.layout?.sections[0].title).toBe('Earnings');
    expect(api.getPayslipLayout).toHaveBeenLastCalledWith('client-b');
  });
  it('shows a failed load without a saveable partial layout', () => {
    api.getEffectiveComponents.mockReturnValueOnce(throwError(() => new Error('offline')));
    const f = fixture(); expect(f.componentInstance.layout).toBeNull();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('could not be loaded');
    expect(f.nativeElement.querySelector('button[type=submit]')).toBeNull();
  });
  it.each([390, 1440])('fits the editor and controls at %ipx', async width => {
    await page.viewport(width, 1000);
    const f = fixture(); const c = f.componentInstance;
    c.selected['EARNINGS'] = 'BASIC'; c.add(c.layout!.sections[0]);
    await f.whenStable(); f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    for (const element of Array.from(host.querySelectorAll('input,select,button'))) {
      const rect = element.getBoundingClientRect();
      expect(rect.right).toBeLessThanOrEqual(width + 1);
      expect(rect.left).toBeGreaterThanOrEqual(0);
    }
    await page.screenshot({ element: host, path: `../../../../.vitest-attachments/payslip-layout-${width}.png` });
  });
});
