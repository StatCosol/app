import { page as browserPage } from 'vitest/browser';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { MyWorkComponent } from './my-work.component';
import { AuthService } from '../../core/auth.service';

const response = {
  items: [
    {
      id: '1',
      title: 'Upload monthly attendance',
      description: 'Confirm the recorded days before submitting.',
      module: 'COMPLIANCE',
      status: 'OPEN',
      priority: 'HIGH',
      client_id: 'c',
      branch_id: 'b',
      company_name: 'Example Company',
      branch_name: 'North Branch',
      due_date: '2026-09-12',
      overdue: true,
    },
  ],
  summary: { all: 1, active: 1, overdue: 1, soon: 0, returned: 0, closed: 0 },
  pagination: { page: 1, total: 1 },
  limit: 25,
  companies: [{ id: 'c', name: 'Example Company' }],
  branches: [{ id: 'b', name: 'North Branch', clientId: 'c' }],
  modules: ['COMPLIANCE'],
  asOf: '2026-09-12',
  generatedAt: '2026-09-12T09:00:00Z',
};
describe('My Work browser behavior', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<any>;
  let router: any;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ branchId: 'b', month: '2026-09' }));
    router = {
      url: '/branch/my-work',
      navigate: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn(),
      serializeUrl: () => '/branch/compliance/status',
      events: new BehaviorSubject(null),
    };
    TestBed.configureTestingModule({
      imports: [MyWorkComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: {} } },
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { hasModule: () => true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  function mount() {
    const f = TestBed.createComponent(MyWorkComponent);
    f.detectChanges();
    return f;
  }
  it('renders reconciled cards, selected context and next-step guidance', () => {
    const f = mount();
    const req = http.expectOne((r) => r.url.endsWith('/tasks/workspace'));
    expect(req.request.params.get('branchId')).toBe('b');
    expect(req.request.params.get('month')).toBe('2026-09');
    req.flush(response);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Upload monthly attendance');
    expect(f.nativeElement.textContent).toContain('1 task');
    const button = [...f.nativeElement.querySelectorAll('button')].find((b: any) =>
      b.textContent.includes('Review next step'),
    ) as HTMLButtonElement;
    button.click();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('locate this task');
    f.destroy();
  });
  it('cancels prior requests and clears stale results when the branch changes', () => {
    const f = mount();
    const old = http.expectOne((r) => r.url.endsWith('/tasks/workspace'));
    params.next(convertToParamMap({ branchId: 'b2' }));
    expect(old.cancelled).toBe(true);
    expect(f.componentInstance.result()).toBeNull();
    const current = http.expectOne((r) => r.params.get('branchId') === 'b2');
    current.flush({ ...response, items: [], pagination: { page: 1, total: 0 } });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No tasks match');
    expect(f.nativeElement.textContent).not.toContain('Upload monthly attendance');
    f.destroy();
  });
  it('shows a retryable error instead of zero totals', () => {
    const f = mount();
    http
      .expectOne((r) => r.url.endsWith('/tasks/workspace'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('could not be loaded');
    expect(f.componentInstance.result()).toBeNull();
    f.componentInstance.load();
    http.expectOne((r) => r.url.endsWith('/tasks/workspace')).flush(response);
    expect(f.componentInstance.error()).toBe('');
    f.destroy();
  });
  it('resets branch and pagination when the company changes', () => {
    const f = mount();
    http.expectOne((r) => r.url.endsWith('/tasks/workspace')).flush(response);
    f.componentInstance.company = 'new';
    f.componentInstance.page = 4;
    f.componentInstance.companyChanged();
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ clientId: 'new', branchId: null, page: 1 }),
      }),
    );
    f.destroy();
  });
  it('fits desktop and mobile widths with readable next steps', async () => {
    const f = mount();
    http.expectOne((r) => r.url.endsWith('/tasks/workspace')).flush(response);
    f.componentInstance.selected.set(response.items[0] as any);
    f.detectChanges();
    for (const [width, name] of [
      [1280, 'desktop'],
      [390, 'mobile'],
    ] as const) {
      await browserPage.viewport(width, 2400);
      await f.whenStable();
      expect(f.nativeElement.querySelector('.work-page').scrollWidth).toBeLessThanOrEqual(width);
      await browserPage.screenshot({
        element: f.nativeElement,
        path: '../../../../../docs/reviews/2026-09-12/my-work-' + name + '.png',
      });
    }
    f.destroy();
  });
});
