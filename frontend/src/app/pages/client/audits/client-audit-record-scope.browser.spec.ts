import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { ClientAuditsComponent } from './client-audits.component';
import { ClientAuditsService } from '../../../core/client-audits.service';
import { ReportsService } from '../../../core/reports.service';

describe('Client audit record scope', () => {
  const actual = { id: 'actual', auditCode: 'ACTUAL-2099', periodYear: 2099, status: 'PLANNED', auditType: 'OTHER' };
  const test = { ...actual, id: 'test', auditCode: 'TEST ONLY fixture', status: 'IN_PROGRESS' };
  function setup() {
    const api = {
      list: vi.fn((filters: any) => of(filters.recordScope === 'TEST' ? [test] : [actual])),
      publishedReport: vi.fn(() => of(new Blob())),
    };
    const component = new ClientAuditsComponent(api as any, { markForCheck: vi.fn() } as any);
    return { api, component };
  }

  it('defaults to actual and retains explicit test scope for filters, refresh and export', () => {
    const { component: c, api } = setup();
    c.loadAudits(); expect(c.audits[0].id).toBe('actual');
    c.filters.recordScope = 'TEST'; c.filters.year = ''; c.loadAudits();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ recordScope: 'TEST', year: '' }));
    expect(c.auditCounts).toEqual({ total: 1, planned: 0, inProgress: 1, completed: 0 });
    const exportSpy = vi.spyOn(ReportsService, 'exportCsv').mockImplementation(() => {});
    c.exportCsv(); expect(exportSpy).toHaveBeenLastCalledWith(c.audits, expect.any(Array), 'TEST-ONLY-client-audits.csv');
    c.filters.recordScope = 'ACTUAL'; c.loadAudits();
    expect(c.audits[0].id).toBe('actual'); expect(c.auditCounts.inProgress).toBe(0);
    exportSpy.mockRestore(); c.ngOnDestroy();
  });

  it('clears old rows, selection and late report previews across scopes and failed requests', () => {
    const { component: c, api } = setup(); c.filters.recordScope = 'TEST'; c.loadAudits();
    c.openAuditDetail(test);
    const report = new Subject<Blob>(); api.publishedReport.mockReturnValueOnce(report);
    c.openReport({ ...test, publishedReportAvailable: true });
    const pending = new Subject<any[]>(); api.list.mockReturnValueOnce(pending);
    c.filters.recordScope = 'ACTUAL'; c.loadAudits();
    expect(c.selectedAudit).toBeNull(); expect(c.audits).toEqual([]); expect(c.openingReport).toBe('');
    report.next(new Blob(['old test report'])); report.complete(); expect(c.preview).toBeNull();
    const exportSpy = vi.spyOn(ReportsService, 'exportCsv').mockImplementation(() => {});
    c.exportCsv(); expect(exportSpy).not.toHaveBeenCalled();
    pending.error(new Error('offline')); expect(c.errorMessage).toBeTruthy();
    c.exportCsv(); expect(exportSpy).not.toHaveBeenCalled();
    exportSpy.mockRestore(); c.ngOnDestroy();
  });

  it.each([390, 768, 1440])('shows explicit scope and isolated totals at %s px', async width => {
    await page.viewport(width, 1000);
    const t = setup();
    await TestBed.configureTestingModule({ imports: [ClientAuditsComponent], providers: [provideHttpClient(), { provide: ClientAuditsService, useValue: t.api }] }).compileComponents();
    const fixture = TestBed.createComponent(ClientAuditsComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const select = root.querySelector('#client-audit-record-scope') as HTMLSelectElement;
    expect(select).toBeTruthy();
    select.value = Array.from(select.options).find(option => option.textContent?.trim() === 'Test audits only')!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.filters.recordScope).toBe('TEST');
    expect(fixture.componentInstance.audits[0].id).toBe('test');
    expect(root.textContent).toContain('Test audits only.');
    expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
