import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { AuditorAiAuditComponent } from './auditor-ai-audit.component';

function setup() {
  const api = { generateAuditObservation: vi.fn((_body: unknown) => of({ id: 'observation' } as any)) };
  const toast = { error: vi.fn(), success: vi.fn() };
  const component = new AuditorAiAuditComponent(api as any, { markForCheck: vi.fn() } as any, toast as any, {} as any);
  component.showGenerate = true;
  component.genForm = { clientId: 'company', auditId: 'audit', findingType: '', findingDescription: '  Test finding  ', applicableState: '' };
  return { component, api, toast };
}

describe('AI observation generation form', () => {
  it('prevents overlapping submissions and trims the finding', () => {
    const { component, api } = setup();
    const pending = new Subject<any>(); api.generateAuditObservation.mockReturnValue(pending);
    component.generate(); component.generate();
    expect(api.generateAuditObservation).toHaveBeenCalledExactlyOnceWith({ clientId: 'company', auditId: 'audit', findingDescription: 'Test finding' });
    expect(component.generating).toBe(true);
    pending.next({ id: 'result' }); pending.complete();
    expect(component.generating).toBe(false);
    expect(component.observations).toHaveLength(1);
    expect(component.showGenerate).toBe(false);
    component.ngOnDestroy();
  });

  it('shows a reference rejection and retains the form for correction and retry', () => {
    const { component, api, toast } = setup();
    api.generateAuditObservation.mockReturnValueOnce(throwError(() => ({ error: { message: 'Audit does not belong to the selected company' } })));
    component.generate();
    expect(toast.error).toHaveBeenCalledWith('Audit does not belong to the selected company');
    expect(component.genForm.auditId).toBe('audit');
    expect(component.showGenerate).toBe(true);
    expect(component.generating).toBe(false);
    expect(component.observations).toHaveLength(0);
    component.genForm.auditId = 'corrected'; component.generate();
    expect(api.generateAuditObservation).toHaveBeenLastCalledWith(expect.objectContaining({ auditId: 'corrected' }));
    component.ngOnDestroy();
  });

  it.each([{}, { message: ['Unexpected', 'payload'] }])('shows a usable fallback for an unavailable message: %j', error => {
    const { component, api, toast } = setup();
    api.generateAuditObservation.mockReturnValue(throwError(() => ({ error })));
    component.generate();
    expect(toast.error).toHaveBeenCalledWith('Failed to generate observation.');
    component.ngOnDestroy();
  });

  it('does not submit whitespace-only findings', () => {
    const { component, api } = setup(); component.genForm.findingDescription = ' \n ';
    component.generate(); expect(api.generateAuditObservation).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
});
