import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { AiPayrollComponent } from './ai-payroll.component';
import { TestBed } from '@angular/core/testing';
import { AiApiService } from '../../../core/ai-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { FilterOptionsService } from '../../../shared/filters/services/filter-options.service';

function setup() {
  const api = {
    detectPayrollAnomalies: vi.fn((_client: string, _run?: string) => of([] as any[])),
    listPayrollAnomalies: vi.fn(() => of([])),
    getPayrollAnomalySummary: vi.fn(() => of({ total: 0 })),
  };
  const toast = { error: vi.fn(), success: vi.fn() };
  const component = new AiPayrollComponent(api as any, { markForCheck: vi.fn() } as any, toast as any, {} as any);
  component.detectClientId = 'company';
  component.detectRunId = '  run  ';
  component.showDetectPanel = true;
  return { component, api, toast };
}

describe('Payroll anomaly detection form', () => {
  it('trims the run and prevents duplicate submissions until completion', () => {
    const { component, api } = setup();
    const pending = new Subject<any[]>();
    api.detectPayrollAnomalies.mockReturnValue(pending);
    component.detect(); component.detect();
    expect(api.detectPayrollAnomalies).toHaveBeenCalledExactlyOnceWith('company', 'run');
    expect(component.detecting).toBe(true);
    pending.next([]); pending.complete();
    expect(component.detecting).toBe(false);
    expect(component.showDetectPanel).toBe(false);
    component.ngOnDestroy();
  });

  it('shows the server rejection without a success toast or stale latest results and allows retry', () => {
    const { component, api, toast } = setup();
    component.detectedAnomalies = [{ id: 'old-result' } as any];
    api.detectPayrollAnomalies.mockReturnValueOnce(throwError(() => ({ error: { message: 'Payroll run does not belong to the selected company' } })));
    component.detect();
    expect(toast.error).toHaveBeenCalledWith('Payroll run does not belong to the selected company');
    expect(toast.success).not.toHaveBeenCalled();
    expect(component.detectedAnomalies).toEqual([]);
    expect(component.detectionError).toBe('Payroll run does not belong to the selected company');
    expect(component.showDetectPanel).toBe(true);
    expect(component.detectRunId).toBe('  run  ');
    expect(component.detecting).toBe(false);
    expect(api.listPayrollAnomalies).not.toHaveBeenCalled();
    component.detectRunId = 'corrected'; component.detect();
    expect(api.detectPayrollAnomalies).toHaveBeenLastCalledWith('company', 'corrected');
    expect(component.detectionError).toBe('');
    component.ngOnDestroy();
  });

  it.each([{}, { message: ['Invalid UUID'] }])('uses a fallback for an unusable error body: %j', error => {
    const { component, api, toast } = setup();
    api.detectPayrollAnomalies.mockReturnValue(throwError(() => ({ error })));
    component.detect();
    expect(toast.error).toHaveBeenCalledWith('Anomaly detection failed.');
    expect(toast.success).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('omits a whitespace-only optional run and uses a qualified completion message', () => {
    const { component, api, toast } = setup(); component.detectRunId = '  ';
    component.detect();
    expect(api.detectPayrollAnomalies).toHaveBeenCalledWith('company', undefined);
    expect(toast.success).toHaveBeenCalledWith('No anomalies found by the completed checks.');
    component.ngOnDestroy();
  });

  it('does not apply an old response to a different selected client', () => {
    const { component, api, toast } = setup();
    const pending = new Subject<any[]>(); api.detectPayrollAnomalies.mockReturnValue(pending);
    component.detect(); component.detectClientId = 'another-company';
    pending.next([{ id: 'old-company-result' }]); pending.complete();
    expect(component.detectedAnomalies).toEqual([]);
    expect(api.listPayrollAnomalies).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('cancels subscriptions on destruction', () => {
    const { component, api, toast } = setup();
    const pending = new Subject<any[]>(); api.detectPayrollAnomalies.mockReturnValue(pending);
    component.detect(); component.ngOnDestroy(); pending.next([]);
    expect(component.detecting).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('renders locked inputs while scanning and an error instead of an empty success state', async () => {
    const { api, toast } = setup();
    const pending = new Subject<any[]>(); api.detectPayrollAnomalies.mockReturnValue(pending);
    await TestBed.configureTestingModule({
      imports: [AiPayrollComponent],
      providers: [
        { provide: AiApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: FilterOptionsService, useValue: { adminClients: () => of([{ id: 'company', name: 'Test' }]) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AiPayrollComponent);
    const component = fixture.componentInstance;
    component.detectClientId = 'company'; component.showDetectPanel = true;
    fixture.detectChanges(); await fixture.whenStable();
    component.detect(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#ap-detect-client-id').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('#ap-detect-run-id').disabled).toBe(true);
    pending.error({ error: { message: 'Scan unavailable' } }); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Scan unavailable');
    expect(fixture.nativeElement.querySelector('ui-empty-state')).toBeNull();
    expect(fixture.nativeElement.querySelector('#ap-detect-client-id').disabled).toBe(false);
    fixture.destroy();
  });
});
