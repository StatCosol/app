import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditsService } from '../../../core/audits.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { CrmAuditManagementPageComponent } from './crm-audit-management-page.component';

describe('CRM report holds', () => {
  const sampleAudit = { id: 'sample-audit', auditCode: 'QA-2026-09', status: 'IN_PROGRESS', client: { clientName: 'QA Sample Manufacturing' } } as any;
  function setup() {
    const api = {
      crmApproveReport: vi.fn(() => of({})),
      crmPublishReport: vi.fn(() => of({})),
      crmReleaseReportHold: vi.fn(() => of({})),
      crmGetReadiness: vi.fn(() => of({})),
      crmGetReportStatus: vi.fn(() => of({ status: 'SUBMITTED', held: false })),
    };
    const toast = { success: vi.fn(), error: vi.fn() };
    const component = new CrmAuditManagementPageComponent(api as any, {} as any, {} as any, {} as any, toast as any, {} as any, {} as any, { markForCheck: vi.fn() } as any);
    component.selectedAudit = sampleAudit;
    component.latestReportStatus = { status: 'SUBMITTED', held: true, holdRemarks: 'Awaiting evidence' };
    return { component, api, toast };
  }

  it('blocks approve and publish when server status is held', () => {
    const { component, api } = setup();
    component.approveReport(); component.publishReport();
    expect(api.crmApproveReport).not.toHaveBeenCalled();
    expect(api.crmPublishReport).not.toHaveBeenCalled();
  });

  it('releases hold and reloads status from the API', () => {
    const { component, api } = setup();
    component.releaseReportHold();
    expect(api.crmReleaseReportHold).toHaveBeenCalledWith('sample-audit');
    expect(api.crmGetReportStatus).toHaveBeenCalledWith('sample-audit');
    expect(component.latestReportStatus?.held).toBe(false);
    expect(component.governanceBusy).toBe(false);
  });

  it('keeps the held state when release fails', () => {
    const { component, api, toast } = setup();
    api.crmReleaseReportHold.mockReturnValue(throwError(() => ({ error: { message: 'Not assigned' } })));
    component.releaseReportHold();
    expect(component.latestReportStatus?.held).toBe(true);
    expect(component.governanceBusy).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Not assigned');
  });

  it('does not submit duplicate releases while waiting', () => {
    const { component, api } = setup();
    const pending = new Subject<any>(); api.crmReleaseReportHold.mockReturnValue(pending);
    component.releaseReportHold(); component.releaseReportHold();
    expect(api.crmReleaseReportHold).toHaveBeenCalledTimes(1);
    pending.next({}); pending.complete(); component.ngOnDestroy();
  });

  it.each([390, 1440])('renders held reports and wrapped notes at %s pixels', async width => {
    await page.viewport(width, 1000);
    const { api, toast } = setup();
    await TestBed.configureTestingModule({
      imports: [CrmAuditManagementPageComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [{ provide: AuditsService, useValue: api }, { provide: ToastService, useValue: toast }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CrmAuditManagementPageComponent);
    const component = fixture.componentInstance;
    vi.spyOn(component as any, 'loadInitialData').mockImplementation(() => {});
    component.loading = false;
    component.selectedAudit = sampleAudit;
    component.audits = [sampleAudit];
    component.filteredAudits = [sampleAudit];
    component.latestReportStatus = { stage: 'FINAL', status: 'SUBMITTED', held: true, holdRemarks: 'Awaiting signed evidence. '+ 'Sample-reference-'.repeat(35) };
    fixture.detectChanges(); await fixture.whenStable();
    const section = fixture.nativeElement.querySelector('[aria-label="Report status"]') as HTMLElement;
    const findButton = (text: string) => Array.from(section.querySelectorAll('button')).find(b => b.textContent?.trim().endsWith(text));
    expect(section.textContent).toContain('On hold');
    expect(findButton('Approve')?.disabled).toBe(true);
    expect(findButton('Release Hold')?.disabled).toBe(false);
    expect(findButton('Hold')?.textContent?.trim()).toBe('Release Hold');
    const notes = section.querySelector('[role="status"] p') as HTMLElement;
    expect(notes.scrollWidth).toBeLessThanOrEqual(notes.clientWidth + 1);
    expect(section.getBoundingClientRect().width).toBeLessThanOrEqual(width);
    section.scrollIntoView({ block: 'center' });
    await page.screenshot({ path: `__screenshots__/audit-report-held-${width}.png` });
    findButton('Release Hold')!.click();
    fixture.detectChanges(); await fixture.whenStable();
    expect(section.textContent).not.toContain('On hold');
    expect(findButton('Approve')?.disabled).toBe(false);
    api.crmGetReportStatus.mockReturnValue(of({ status: 'DRAFT', held: false }));
    (component as any).loadAuditInsights('sample-audit');
    fixture.detectChanges(); await fixture.whenStable();
    expect(findButton('Hold')).toBeUndefined();
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
