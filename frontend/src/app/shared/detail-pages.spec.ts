import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { page } from 'vitest/browser';
import { BranchAppraisalFormComponent } from '../pages/branch/performance-appraisal/branch-appraisal-form.component';
import { ClientAppraisalApproveComponent } from '../pages/client/performance-appraisal/client-appraisal-approve.component';
import { NewsDetailComponent } from './news/news-detail.component';
import { VendorAuditNcsComponent } from '../pages/shared-vendor/vendor-audit-ncs.component';
import { AuditsService } from '../core/audits.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from './toast/toast.service';
import { PerformanceAppraisalService } from '../core/services/performance-appraisal.service';

const cdr = { markForCheck: vi.fn() };
const router = { navigate: vi.fn(), url: '/auditor/news' };
const appraisal = (id: string) => ({ id, employee_name: 'TEST Employee', status: 'INITIATED', items: [] });

describe.each([BranchAppraisalFormComponent, ClientAppraisalApproveComponent])('%s detail requests', Component => {
  it.each([390, 812])('keeps long review criteria readable without widening the page at %s px', async width => {
    await page.viewport(width, 900);
    const record = { ...appraisal('test'), ctc: null, cycle_name: 'TEST review', items: Array.from({length: 8}, (_, i) => ({
      id: String(i), itemName: 'TEST long review criterion '.repeat(6), weightage: 12.5,
    })) };
    await TestBed.configureTestingModule({
      imports: [Component], providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({id: 'test'})) } },
        { provide: PerformanceAppraisalService, useValue: { getAppraisal: () => of(record) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent<any>(Component);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('\uFFFD');
    expect(fixture.nativeElement.querySelector('td:nth-child(2)').getBoundingClientRect().width).toBeGreaterThanOrEqual(240);
    expect(fixture.nativeElement.scrollWidth).toBeLessThanOrEqual(width + 1);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
  it('finishes loading before the route stream completes and discards old requests', () => {
    const params = new BehaviorSubject(convertToParamMap({ id: 'one' }));
    const one = new Subject<any>(), two = new Subject<any>();
    const svc = { getAppraisal: vi.fn((id: string) => id === 'one' ? one : two) };
    const c = new Component(svc as any, { paramMap: params } as any, router as any, cdr as any);
    c.ngOnInit();
    one.next(appraisal('one')); one.complete();
    expect(c.loading).toBe(false);
    expect(c.appraisal?.id).toBe('one');
    params.next(convertToParamMap({ id: 'two' }));
    expect(c.appraisal).toBeNull();
    expect(c.loading).toBe(true);
    two.next(appraisal('two')); two.complete();
    expect(c.appraisal?.id).toBe('two');
    expect(c.loading).toBe(false);
    c.ngOnDestroy();
  });
  it('shows a recoverable error and retries without reloading the portal', () => {
    const svc = { getAppraisal: vi.fn().mockReturnValueOnce(throwError(() => new Error('403'))).mockReturnValue(of(appraisal('one'))) };
    const c = new Component(svc as any, { paramMap: of(convertToParamMap({ id: 'one' })) } as any, router as any, cdr as any);
    c.ngOnInit();
    expect(c.error).toContain('Unable to load');
    expect(c.loading).toBe(false);
    c.retry();
    expect(c.error).toBe('');
    expect(c.appraisal?.id).toBe('one');
    c.ngOnDestroy();
  });
});

describe('News detail navigation', () => {
  function setup() {
    const params = new BehaviorSubject(convertToParamMap({ newsId: 'one' }));
    const svc = { getActiveNews: vi.fn(() => of([{ id: 'one', title: 'First' }, { id: 'two', title: 'Second' }])), getNewsItem: vi.fn() };
    const c = new NewsDetailComponent({ paramMap: params } as any, router as any, svc as any, {} as any, {} as any, cdr as any);
    return { c, params, svc };
  }
  it('updates the displayed article when only its route parameter changes', () => {
    const { c, params } = setup();
    c.ngOnInit();
    expect(c.selectedItem?.id).toBe('one');
    params.next(convertToParamMap({ newsId: 'two' }));
    expect(c.selectedItem?.id).toBe('two');
    expect(c.otherItems.map(i => i.id)).toEqual(['one']);
    c.selectItem({ id: 'one' } as any);
    expect(router.navigate).toHaveBeenCalledWith(['/auditor', 'news', 'one']);
    c.ngOnDestroy();
  });
  it('keeps loading until the fallback article arrives and handles its failure', () => {
    const { c, params, svc } = setup();
    const fallback = new Subject<any>();
    svc.getNewsItem.mockReturnValue(fallback);
    params.next(convertToParamMap({ newsId: 'archived' }));
    c.ngOnInit();
    expect(c.loading).toBe(true);
    fallback.error(new Error('404'));
    expect(c.loading).toBe(false);
    expect(c.error).toContain('Unable to load');
    params.next(convertToParamMap({ newsId: 'two' }));
    expect(c.error).toBe('');
    expect(c.selectedItem?.id).toBe('two');
    c.ngOnDestroy();
  });
  it('recognizes PDFs with signed query strings', () => {
    const { c } = setup();
    expect(c.isPdf('/file.PDF?signature=123#page=2')).toBe(true);
    expect(c.isPdf('/file.png')).toBe(false);
  });
});

describe('Audit correction detail', () => {
  it('shows date-only deadlines without inventing a time', () => {
    const c = new VendorAuditNcsComponent({} as any, {} as any, {} as any, {} as any, cdr as any);
    expect(c.formatDate('2026-10-30')).toBe('30 Oct 2026');
  });
  it('cancels stale loads and does not show an unpublished notice on permission failure', () => {
    const first = new Subject<any>(), second = new Subject<any>();
    const api = { branchListNcsForAudit: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValue(throwError(() => new Error('403'))) };
    const params = new BehaviorSubject(convertToParamMap({ id: 'one' }));
    const c = new VendorAuditNcsComponent({ paramMap: params } as any, api as any, { getRoleCode: () => 'CLIENT' } as any, {} as any, cdr as any);
    c.ngOnInit();
    params.next(convertToParamMap({ id: 'two' }));
    first.next({ items: [{ id: 'old' }] });
    expect(c.items).toEqual([]);
    second.next({ publishedAt: '2026-10-20', items: [{ id: 'new' }] }); second.complete();
    expect(c.items[0].id).toBe('new');
    c.load();
    expect(c.items).toEqual([]);
    expect(c.error).toContain('Unable to load');
    expect(c.loading).toBe(false);
    c.ngOnDestroy();
  });
  it.each([390, 812, 1440])('keeps correction evidence controls within the page at %s px', async width => {
    await page.viewport(width, 900);
    const api = { contractorListNcsForAudit: () => of({ publishedAt: '2026-10-20', items: [{
      id: 'test', documentName: 'TEST Long contractor compliance evidence ' + 'description '.repeat(12),
      remark: 'TEST correction request', status: 'AWAITING_CORRECTION', vendorWindowUntil: '2026-10-30T12:00:00Z'
    }] }) };
    await TestBed.configureTestingModule({
      imports: [VendorAuditNcsComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'test' })) } },
        { provide: AuditsService, useValue: api }, { provide: AuthService, useValue: { getRoleCode: () => 'CONTRACTOR' } },
        { provide: ToastService, useValue: {} }],
    }).compileComponents();
    const fixture = TestBed.createComponent(VendorAuditNcsComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('30 Oct 2026');
    const input = fixture.nativeElement.querySelector('input[type=file]');
    expect(input.getAttribute('aria-label')).toContain('Corrected evidence');
    expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(width + 1);
    expect(fixture.nativeElement.scrollWidth).toBeLessThanOrEqual(width + 1);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
