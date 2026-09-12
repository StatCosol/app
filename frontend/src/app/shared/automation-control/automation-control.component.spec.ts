import { page as browserPage } from 'vitest/browser';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AutomationControlComponent } from './automation-control.component';
const data = {
  rules: [
    {
      key: 'expiry',
      name: 'Expiry renewals',
      description: 'Create renewal filings and tasks; remind document owners.',
      routing: 'Branch queue and document owner',
      window: 'Registrations: 60 days; documents: 30 days',
    },
    {
      key: 'task_reminders',
      name: 'Task reminders',
      description: 'Remind owners and escalate overdue work.',
      routing: 'Owner and CRM',
      window: '3 days',
    },
    {
      key: 'filing_overdue',
      name: 'Overdue filing alerts',
      description: 'Notify the CRM about overdue filings.',
      routing: 'Current company CRM',
      window: 'Past due filings',
    },
    {
      key: 'nc_reminders',
      name: 'Audit corrections',
      description: 'Remind the audit owner about unresolved findings.',
      routing: 'Assigned auditor',
      window: 'Open findings',
    },
  ],
  controls: [
    {
      id: 'control1',
      rule_key: 'expiry',
      client_id: null,
      branch_id: null,
      enabled: true,
      local_time: '07:00',
      version: 1,
    },
  ],
  companies: [{ id: 'c1', name: 'Example Company' }],
  branches: [
    { id: 'b1', clientId: 'c1', name: 'North Branch' },
    { id: 'b2', clientId: 'c1', name: 'South Branch' },
  ],
};
const preview = {
  plan: { digest: 'a'.repeat(64), controlId: 'control1', enabled: true, scope: {} },
  asOf: '2026-09-12',
  groups: [
    {
      name: 'Registration expiries',
      count: 2,
      examples: [
        { id: 'r1', title: 'Factory licence' },
        { id: 'r2', title: 'Establishment registration' },
      ],
    },
  ],
  note: 'Eligible records at preview time. Actual new actions may be fewer.',
};
const run = {
  id: 'run1',
  rule_key: 'expiry',
  status: 'FAILED',
  trigger_type: 'MANUAL',
  started_at: '2026-09-12T06:00:00Z',
  finished_at: '2026-09-12T06:00:01Z',
  error_message: 'Execution failed. Safe retry is available.',
  snapshot: { scope: {} },
  result: null,
  retry_of: null,
};
describe('Automation Control Centre browser behaviour', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AutomationControlComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  function mount() {
    const f = TestBed.createComponent(AutomationControlComponent);
    f.detectChanges();
    http.expectOne((r) => r.url.endsWith('/control-center')).flush(data);
    http.expectOne((r) => r.url.endsWith('/runs')).flush({ rows: [], total: 0 });
    http.expectOne((r) => r.url.endsWith('/changes')).flush([]);
    f.detectChanges();
    return f;
  }
  it('requires a fresh preview before manual execution', () => {
    const f = mount();
    expect(f.nativeElement.textContent).toContain('Automation Control Centre');
    f.componentInstance.showPreview();
    http.expectOne((r) => r.url.endsWith('/preview')).flush(preview);
    f.detectChanges();
    const button = [...f.nativeElement.querySelectorAll('button')].find((b: any) =>
      b.textContent.includes('Run now'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    f.componentInstance.localTime = '09:00';
    f.componentInstance.invalidate();
    f.detectChanges();
    expect(f.componentInstance.preview()).toBeNull();
    f.destroy();
  });
  it('cancels stale scope previews', () => {
    const f = mount();
    f.componentInstance.showPreview();
    const previous = http.expectOne((r) => r.url.endsWith('/preview'));
    f.componentInstance.company = 'c1';
    f.componentInstance.companyChanged();
    expect(previous.cancelled).toBe(true);
    f.componentInstance.branch = 'b1';
    f.componentInstance.syncSelection();
    f.componentInstance.showPreview();
    const current = http.expectOne((r) => r.url.endsWith('/preview'));
    expect(current.request.body).toEqual({ ruleKey: 'expiry', clientId: 'c1', branchId: 'b1' });
    current.flush({ ...preview, plan: { ...preview.plan, controlId: null } });
    expect(f.componentInstance.exact).toBeUndefined();
    f.destroy();
  });
  it('submits the saved scope, preview digest and one idempotency key', () => {
    const f = mount();
    f.componentInstance.showPreview();
    http.expectOne((r) => r.url.endsWith('/preview')).flush(preview);
    f.componentInstance.run();
    const req = http.expectOne((r) => r.url.endsWith('/runs') && r.method === 'POST');
    expect(req.request.body.controlId).toBe('control1');
    expect(req.request.body.previewDigest).toBe(preview.plan.digest);
    expect(req.request.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    req.flush({ ...run, status: 'SUCCEEDED' });
    http
      .expectOne((r) => r.url.endsWith('/runs') && r.method === 'GET')
      .flush({ rows: [{ ...run, status: 'SUCCEEDED' }], total: 1 });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Run completed.');
    expect(f.componentInstance.preview()).toBeNull();
    f.destroy();
  });
  it('keeps backend conflicts visible without reporting success', () => {
    const f = mount();
    f.componentInstance.enabled = false;
    f.componentInstance.save();
    http
      .expectOne((r) => r.url.endsWith('/settings'))
      .flush(
        { message: 'Settings changed. Refresh before saving.' },
        { status: 409, statusText: 'Conflict' },
      );
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Settings changed');
    expect(f.componentInstance.busy()).toBe(false);
    f.destroy();
  });
  it('retries only the selected failed run', () => {
    const f = mount();
    f.componentInstance.runs.set([run]);
    f.detectChanges();
    const retry = [...f.nativeElement.querySelectorAll('button')].find((b: any) =>
      b.textContent.includes('Retry safely'),
    ) as HTMLButtonElement;
    retry.click();
    const req = http.expectOne((r) => r.url.endsWith('/runs/run1/retry'));
    expect(req.request.body.requestId).toBeTruthy();
    req.flush({ ...run, id: 'run2', status: 'SUCCEEDED', retry_of: 'run1' });
    http
      .expectOne((r) => r.url.endsWith('/runs'))
      .flush({ rows: [{ ...run, status: 'SUCCEEDED' }], total: 1 });
    f.destroy();
  });
  it('cancels an earlier history page when a new page is requested', () => {
    const f = mount();
    f.componentInstance.history();
    const old = http.expectOne((r) => r.url.endsWith('/runs'));
    f.componentInstance.movePage(1);
    expect(old.cancelled).toBe(true);
    const current = http.expectOne((r) => r.url.endsWith('/runs'));
    expect(current.request.params.get('page')).toBe('2');
    current.flush({ rows: [run], total: 26 });
    expect(f.componentInstance.runs()[0].id).toBe('run1');
    f.destroy();
  });
  it('renders desktop and mobile without horizontal overflow', async () => {
    const f = mount();
    f.componentInstance.preview.set(preview);
    f.componentInstance.runs.set([run]);
    f.componentInstance.total = 1;
    f.detectChanges();
    for (const [width, name] of [
      [1280, 'desktop'],
      [390, 'mobile'],
    ] as const) {
      await browserPage.viewport(width, 3600);
      await f.whenStable();
      expect(f.nativeElement.querySelector('.automation-page').scrollWidth).toBeLessThanOrEqual(
        width,
      );
      await browserPage.screenshot({
        element: f.nativeElement,
        path: '../../../../../docs/reviews/2026-09-12/automation-control-' + name + '.png',
      });
    }
    f.destroy();
  });
});
