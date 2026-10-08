import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditsService } from '../../../core/audits.service';
import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuditorReportBuilderComponent } from './auditor-report-builder.component';

describe('Auditor report builder holds', () => {
  const route = { snapshot: { paramMap: convertToParamMap({ auditId: 'sample-audit' }) }, paramMap: of(convertToParamMap({ auditId: 'sample-audit' })) };
  function setup(report: any = { stage: 'FINAL', held: true, holdRemarks: 'Awaiting signed proof' }) {
    const api = {
      auditorGetAudit: vi.fn(() => of({ id: 'sample-audit', auditCode: 'QA-2026-09', status: 'SUBMITTED', client: { clientName: 'QA Sample Manufacturing' } })),
      auditorGetReport: vi.fn(() => of(report)),
      auditorReopenReport: vi.fn(() => of({ stage: 'DRAFT', held: false })),
      auditorSaveReport: vi.fn(),
    };
    const observations = { list: vi.fn(() => of([])) };
    const toast = { error: vi.fn(), info: vi.fn(), success: vi.fn() };
    const component = new AuditorReportBuilderComponent(route as any, api as any, observations as any, toast as any, { markForCheck: vi.fn() } as any);
    return { component, api, observations, toast };
  }

  it('preserves server hold fields and blocks reopening without a failing request', () => {
    const { component, api } = setup(); component.ngOnInit();
    expect(component.draft?.held).toBe(true);
    expect(component.draft?.holdRemarks).toBe('Awaiting signed proof');
    expect(component.canReopen).toBe(false);
    expect(component.canEdit).toBe(false);
    expect(component.canExportFinal).toBe(true);
    component.reopenDraft(); expect(api.auditorReopenReport).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('allows reopening after a status reload confirms that the hold was released', () => {
    const { component, api } = setup(); component.ngOnInit();
    api.auditorGetReport.mockReturnValue(of({ stage: 'FINAL', held: false, holdRemarks: null }));
    (component as any).loadBuilder();
    expect(component.canReopen).toBe(true);
    component.reopenDraft(); expect(api.auditorReopenReport).toHaveBeenCalledWith('sample-audit');
    expect(component.draft?.held).toBe(false);
    expect(component.draft?.holdRemarks).toBeNull();
    component.ngOnDestroy();
  });

  it('defaults missing legacy hold metadata to not held', () => {
    const { component } = setup({ stage: 'FINAL' }); component.ngOnInit();
    expect(component.draft?.held).toBe(false);
    expect(component.canReopen).toBe(true);
    component.ngOnDestroy();
  });

  it.each([390, 1440])('shows the reason and disables Reopen at %s pixels', async width => {
    await page.viewport(width, 1000);
    const { api, observations, toast } = setup({ stage: 'FINAL', held: true, holdRemarks: 'Awaiting signed proof. '+ 'long-reference-'.repeat(30) });
    await TestBed.configureTestingModule({
      imports: [AuditorReportBuilderComponent, RouterTestingModule, HttpClientTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: AuditsService, useValue: api },
        { provide: AuditorObservationsService, useValue: observations },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AuditorReportBuilderComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const hold = fixture.nativeElement.querySelector('[aria-label="Report hold"]') as HTMLElement;
    expect(hold.textContent).toContain('On hold');
    expect(hold.textContent).toContain('Awaiting signed proof');
    expect(hold.scrollWidth).toBeLessThanOrEqual(hold.clientWidth + 1);
    expect(hold.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    const reopen = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b => (b.getAttribute('aria-label') || b.textContent)?.includes('Reopen'))!;
    expect(reopen.disabled).toBe(true);
    reopen.click(); expect(api.auditorReopenReport).not.toHaveBeenCalled();
    hold.scrollIntoView({ block: 'center' });
    await page.screenshot({ path: `__screenshots__/auditor-report-held-${width}.png` });
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
