import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditsService } from '../../../core/audits.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { CrmComplianceTrackerApi } from '../../../core/api/crm-compliance-tracker.api';
import { CrmAuditManagementPageComponent } from './crm-audit-management-page.component';

describe('CRM separate audit queues', () => {
  it.each(['ACTUAL', 'TEST'] as const)('keeps %s scope on every API page', scope => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const http = TestBed.inject(HttpTestingController), api = TestBed.inject(AuditsService);
    let rows: any[] = [];
    api.crmAllAudits(scope).subscribe(response => rows = response.data);
    for (let index = 1; index <= 2; index++) {
      const request = http.expectOne(req => req.url.endsWith('/crm/audits'));
      expect(request.request.params.get('recordScope')).toBe(scope);
      expect(request.request.params.get('page')).toBe(String(index));
      request.flush({ data: [{ id: `${scope}-${index}` }], total: 2 });
    }
    expect(rows.map(row => row.id)).toEqual([`${scope}-1`, `${scope}-2`]);
    http.verify(); TestBed.resetTestingModule();
  });

  const actual = { id: 'actual', auditCode: 'ACTUAL-2099', clientId: 'client', status: 'PLANNED', periodYear: 2099, periodCode: '2099-11', auditType: 'SAFETY' } as any;
  const test = { ...actual, id: 'test', auditCode: 'TEST ONLY synthetic audit', status: 'IN_PROGRESS' };
  function setup() {
    const api = {
      crmAllAudits: vi.fn((scope: string) => of({ data: scope === 'TEST' ? [test] : [actual] })),
      crmGetAudit: vi.fn((id: string) => of(id === 'test' ? test : actual)),
      crmGetReadiness: vi.fn(() => of({})),
      crmGetReportStatus: vi.fn(() => of({ status: 'DRAFT' })),
      crmAuditActionRequests: vi.fn(() => of([])),
    };
    const tracker = { getAuditClosures: vi.fn(() => of({ data: [] })) };
    const toast = { error: vi.fn() };
    const component = new CrmAuditManagementPageComponent(api as any, { getAssignedClients: () => of([]) } as any, tracker as any, { get: () => of([]) } as any, toast as any, {} as any, {} as any, { markForCheck: vi.fn() } as any);
    return { component, api, tracker, toast };
  }

  it('defaults to actual and keeps test counts, filters and refresh separate', () => {
    const t = setup(); t.component.ngOnInit();
    expect(t.api.crmAllAudits).toHaveBeenLastCalledWith('ACTUAL');
    expect(t.component.totalCount).toBe(1); expect(t.component.inProgressCount).toBe(0);
    t.component.recordScope = 'TEST'; t.component.changeRecordScope();
    expect(t.component.filteredAudits).toEqual([test]); expect(t.component.inProgressCount).toBe(1);
    expect(t.tracker.getAuditClosures).toHaveBeenCalledTimes(1);
    t.component.yearFilter = 2099 as any; t.component.applyFilters();
    expect(t.component.totalCount).toBe(1);
    t.component.clearFilters(); t.component.refreshWorkspace('test');
    expect(t.api.crmAllAudits).toHaveBeenLastCalledWith('TEST');
    expect(t.component.currentAudit?.id).toBe('test');
    t.component.recordScope = 'ACTUAL'; t.component.changeRecordScope();
    expect(t.component.currentAudit?.id).toBe('actual');
    expect(t.component.audits).toEqual([actual]); t.component.ngOnDestroy();
  });

  it('cancels old queue and detail loads and clears all state on scope failure', () => {
    const t = setup(); t.component.ngOnInit();
    const oldList = new Subject<any>(), newList = new Subject<any>(), oldDetail = new Subject<any>();
    t.api.crmGetAudit.mockReturnValueOnce(oldDetail);
    (t.component as any).loadAuditDetail('actual');
    t.api.crmAllAudits.mockReturnValueOnce(oldList).mockReturnValueOnce(newList);
    t.component.refreshWorkspace('actual');
    t.component.recordScope = 'TEST'; t.component.changeRecordScope();
    expect(t.component.currentAudit).toBeNull(); expect(t.component.totalCount).toBe(0);
    oldList.next({ data: [actual] }); oldList.complete(); oldDetail.next(actual); oldDetail.complete();
    expect(t.component.currentAudit).toBeNull(); expect(t.component.listBusy).toBe(true);
    newList.error(new Error('Unavailable'));
    expect(t.component.listBusy).toBe(false); expect(t.component.filteredAudits).toEqual([]);
    expect(t.component.actionRequests).toEqual([]); expect(t.component.latestReportStatus).toBeNull();
    expect(t.toast.error).toHaveBeenCalled(); t.component.ngOnDestroy();
  });

  it.each([390, 768, 1440])('renders an explicit separate scope and switches it at %s px', async width => {
    await page.viewport(width, 1000);
    const t = setup();
    await TestBed.configureTestingModule({
      imports: [CrmAuditManagementPageComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: AuditsService, useValue: t.api },
        { provide: CrmComplianceTrackerApi, useValue: t.tracker },
        { provide: CrmClientsApi, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CrmAuditManagementPageComponent), component = fixture.componentInstance;
    vi.spyOn(component as any, 'loadInitialData').mockImplementation(() => {});
    component.loading = false; component.refreshWorkspace(null);
    fixture.detectChanges(); await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const scope = root.querySelector('#camp-record-scope') as HTMLSelectElement;
    expect(scope.value).toBe('ACTUAL');
    scope.value = 'TEST'; scope.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.recordScope).toBe('TEST');
    expect(component.filteredAudits).toEqual([test]);
    expect(root.textContent).toContain('Test audits only.');
    expect(root.textContent).not.toContain('Open CAPA');
    const scopePanel = root.querySelector('[aria-label="Audit record scope"]') as HTMLElement;
    expect(scopePanel.scrollWidth).toBeLessThanOrEqual(scopePanel.clientWidth + 1);
    expect(scopePanel.getBoundingClientRect().width).toBeLessThanOrEqual(width);
    expect(Array.from(root.querySelectorAll('button')).find(b => b.textContent?.includes('Schedule Audit'))?.disabled).toBe(true);
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
