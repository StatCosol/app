import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, Subject, throwError } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditsService } from '../../../core/audits.service';
import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuditorReportBuilderComponent } from './auditor-report-builder.component';

describe('Auditor report builder holds', () => {
  const completeReport = { reportId: 'report', stage: 'DRAFT', status: 'DRAFT', selectedObservationIds: [], version: 'INTERNAL', executiveSummary: 'Saved summary with sufficient detail.', scope: 'Site and period being audited', methodology: 'Document sampling and site inspection', findings: 'Findings from the site and supporting records.', recommendations: 'Corrective actions and recommendations for the site.' };
  const route = { snapshot: { paramMap: convertToParamMap({ auditId: 'sample-audit' }) }, paramMap: of(convertToParamMap({ auditId: 'sample-audit' })) };
  function setup(report: any = { stage: 'FINAL', held: true, holdRemarks: 'Awaiting signed proof' }) {
    const api = {
      auditorGetAudit: vi.fn(() => of({ id: 'sample-audit', auditCode: 'QA-2026-09', status: 'SUBMITTED', client: { clientName: 'QA Sample Manufacturing' } })),
      auditorGetReport: vi.fn(() => of(report)),
      auditorReopenReport: vi.fn(() => of({ stage: 'DRAFT', held: false })),
      auditorSaveReport: vi.fn(),
      auditorFinalizeReport: vi.fn(),
    };
    const observations = { list: vi.fn(() => of([])) };
    const toast = { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() };
    const component = new AuditorReportBuilderComponent(route as any, api as any, observations as any, toast as any, { markForCheck: vi.fn() } as any);
    return { component, api, observations, toast };
  }

  it('saves the current text and version before finalizing, including a never-saved report', () => {
    for (const reportId of [null, 'report']) {
      const t = setup({ ...completeReport, reportId }); t.component.ngOnInit();
      t.component.draft!.executiveSummary = 'The current edited summary must be issued.';
      t.component.draft!.version = 'CLIENT';
      const request = new Subject<any>(); t.api.auditorSaveReport.mockReturnValue(request);
      t.api.auditorFinalizeReport.mockReturnValue(of({ ...t.component.draft, stage: 'FINAL', status: 'SUBMITTED' }));
      t.component.finalizeDraft(); t.component.finalizeDraft();
      expect(t.api.auditorSaveReport).toHaveBeenCalledTimes(1);
      expect(t.api.auditorSaveReport).toHaveBeenCalledWith('sample-audit', expect.objectContaining({ executiveSummary: 'The current edited summary must be issued.', version: 'CLIENT' }));
      expect(t.api.auditorFinalizeReport).not.toHaveBeenCalled(); expect(t.component.canEdit).toBe(false);
      request.next({}); request.complete();
      expect(t.api.auditorFinalizeReport).toHaveBeenCalledTimes(1);
      expect(t.component.draft!.executiveSummary).toBe('The current edited summary must be issued.');
      expect(t.component.hasUnsavedChanges).toBe(false); t.component.ngOnDestroy();
    }
  });

  it.each(['save', 'finalize'])('retains current edits if %s fails', phase => {
    const t = setup({ ...completeReport }); t.component.ngOnInit();
    t.component.draft!.findings = 'Unsaved current findings that must remain visible.';
    t.api.auditorSaveReport.mockReturnValue(phase === 'save' ? throwError(() => new Error('save failed')) : of({}));
    t.api.auditorFinalizeReport.mockReturnValue(throwError(() => new Error('finalize failed')));
    t.component.finalizeDraft();
    expect(t.component.draft!.findings).toContain('Unsaved current findings'); expect(t.component.saving).toBe(false);
    if (phase === 'save') expect(t.api.auditorFinalizeReport).not.toHaveBeenCalled();
    expect(t.toast.error).toHaveBeenCalled(); t.component.ngOnDestroy();
  });

  it('preserves a saved empty selection instead of importing every observation', () => {
    const t = setup({ ...completeReport }); t.observations.list.mockReturnValue(of([{ id: 'one' }] as any));
    t.component.ngOnInit(); expect(t.component.draft!.selectedObservationIds).toEqual([]);
    expect(t.component.canFinalize).toBe(false); t.component.ngOnDestroy();
  });

  it('removes stale observation IDs on reload so the auditor can select valid findings', () => {
    const t = setup({ ...completeReport, selectedObservationIds: ['deleted-observation'] });
    t.observations.list.mockReturnValue(of([{ id: 'one' }] as any)); t.component.ngOnInit();
    expect(t.component.draft!.selectedObservationIds).toEqual([]); expect(t.component.canFinalize).toBe(false);
    t.component.toggleObservation({ id: 'one' }); expect(t.component.canFinalize).toBe(true); t.component.ngOnDestroy();
  });

  it('preserves historical observation selections in finalized reports', () => {
    const t = setup({ ...completeReport, stage: 'FINAL', status: 'SUBMITTED', selectedObservationIds: ['historical-observation'] });
    t.component.ngOnInit(); expect(t.component.draft!.selectedObservationIds).toEqual(['historical-observation']);
    expect(t.component.canEdit).toBe(false); t.component.ngOnDestroy();
  });

  it('warns before navigation and refresh with unsaved edits', () => {
    const t = setup({ ...completeReport }); t.component.ngOnInit();
    expect(t.component.hasUnsavedChanges).toBe(false); t.component.draft!.scope = 'New unsaved scope';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(t.component.canLeave()).toBe(false);
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    t.component.beforeUnload(event as any); expect(event.preventDefault).toHaveBeenCalled();
    t.api.auditorSaveReport.mockReturnValue(of({ ...t.component.draft })); t.component.saveDraft();
    expect(t.component.canLeave()).toBe(true); confirm.mockRestore(); t.component.ngOnDestroy();
  });

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
