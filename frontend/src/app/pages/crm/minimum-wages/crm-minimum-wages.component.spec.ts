import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CrmMinimumWagesComponent } from './crm-minimum-wages.component';
import { CrmMinimumWagesService } from '../../../core/crm-minimum-wages.service';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

describe('Minimum wages read-only CRM page', () => {
  const row: any = { id: 'test-rate', stateCode: 'TS', skillCategory: 'UNSKILLED', monthlyWage: 10000, effectiveFrom: '2026-11-01' };
  afterEach(() => TestBed.resetTestingModule());
  async function setup(role: string) {
    const api = { list: vi.fn(() => of({ data: [row] })), create: vi.fn(() => of(row)), update: vi.fn(() => of(row)), remove: vi.fn(() => of({})) };
    const confirm = vi.fn(async () => true);
    await TestBed.configureTestingModule({ imports: [CrmMinimumWagesComponent], providers: [
      { provide: CrmMinimumWagesService, useValue: api },
      { provide: AuthService, useValue: { getRoleCode: () => role } },
      { provide: ToastService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CrmMinimumWagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api, confirm, host: fixture.nativeElement as HTMLElement };
  }
  it('shows rates and export without mutation controls for CRM', async () => {
    const { host, component, api } = await setup('CRM');
    expect(host.textContent).toContain('10,000.00');
    expect(host.textContent).toContain('Only Admin');
    expect(Array.from(host.querySelectorAll('button')).some(b => b.textContent?.includes('Export Rates'))).toBe(true);
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(host.textContent).not.toContain('Add Wage');
    expect(host.querySelector('button[aria-label="Edit"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Delete"]')).toBeNull();
    expect(component.visibleColumns.some(c => c.key === 'actions')).toBe(false);
    expect(api.list).toHaveBeenCalled();
  });
  it('guards mutation methods even if called outside the hidden controls', async () => {
    const { component, api, confirm } = await setup('CRM');
    component.openAdd(); component.openEdit(row);
    component.form = { ...row };
    component.save(); await component.remove(row);
    component.onBulkFile(new Event('change'));
    await (component as any).bulkUpload([row]);
    expect(component.showForm).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('retains Admin editing controls and saves through the existing API', async () => {
    const { host, component, api } = await setup('ADMIN');
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Edit"]')).not.toBeNull();
    component.openEdit(row); component.form.monthlyWage = 12000; component.save();
    expect(api.update).toHaveBeenCalledWith('test-rate', expect.objectContaining({ monthlyWage: 12000 }));
  });
});
