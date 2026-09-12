import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MonthlyCloseComponent } from './monthly-close.component';
import { MonthlyCloseResponse, MonthlyCloseService } from '../../core/monthly-close.service';

const sample: MonthlyCloseResponse = {
  clientId: 'c1', branchId: 'b1', branchName: 'Test branch', month: '2026-09', generatedAt: '2026-09-12T09:00:00Z',
  outstanding: 1, needsVerification: false, note: 'Recorded data review only.', stages: [{
    area: 'documents', title: 'Contractor evidence', state: 'REVIEW', total: 2, outstanding: 1,
    description: 'Latest submissions against configured requirements.', truncated: false,
    issues: [{ id: 'd1', sourceId: null, title: 'Vendor — Wage register', reason: 'No submission for this month.', owner: 'Document reviewer', dueDate: null }],
  }],
};

describe('MonthlyCloseComponent', () => {
  let fixture: ComponentFixture<MonthlyCloseComponent>;
  let component: MonthlyCloseComponent;
  let service: { clients: ReturnType<typeof vi.fn>; branches: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    service = {
      clients: vi.fn(() => of({ clients: [{ id: 'c1', clientName: 'Test company' }] })),
      branches: vi.fn(() => of({ branches: [{ id: 'b1', branchName: 'Test branch' }] })),
      get: vi.fn(() => of(sample)),
    };
    await TestBed.configureTestingModule({ imports: [MonthlyCloseComponent], providers: [provideRouter([]), { provide: MonthlyCloseService, useValue: service }] }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/client/monthly-close');
    fixture = TestBed.createComponent(MonthlyCloseComponent);
    component = fixture.componentInstance;
  });
  afterEach(() => vi.restoreAllMocks());

  it('automatically reviews a sole accessible company and branch and displays the next action', () => {
    fixture.detectChanges();
    expect(service.get).toHaveBeenCalledWith('c1', 'b1', component.month);
    expect(fixture.nativeElement.textContent).toContain('Vendor — Wage register');
    expect(fixture.nativeElement.textContent).toContain('Responsible: Document reviewer');
  });
  it('clears results immediately when filters change', () => {
    fixture.detectChanges();
    component.month = '2026-08';
    component.invalidate();
    fixture.detectChanges();
    expect(component.data()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Vendor — Wage register');
  });
  it('cancels old requests so late responses cannot show another month', () => {
    const pending = new Subject<MonthlyCloseResponse>();
    service.get.mockReturnValue(pending);
    fixture.detectChanges();
    component.invalidate();
    pending.next(sample);
    expect(component.data()).toBeNull();
    expect(component.busy()).toBe(false);
  });
  it('ignores branch responses for a previously selected company', () => {
    const pending = new Subject<{ branches: { id: string; branchName: string }[] }>();
    service.branches.mockReturnValue(pending);
    fixture.detectChanges();
    service.branches.mockReturnValue(of({ branches: [] }));
    component.clientId = 'c2';
    component.changeClient();
    pending.next({ branches: [{ id: 'wrong', branchName: 'Old branch' }] });
    expect(component.branches()).toEqual([]);
    expect(component.branchId).toBe('');
    expect(service.get).not.toHaveBeenCalled();
  });
  it('displays failure instead of retaining previous successful results', () => {
    fixture.detectChanges();
    service.get.mockReturnValue(throwError(() => new Error('network')));
    component.load();
    fixture.detectChanges();
    expect(component.data()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not load');
    expect(component.busy()).toBe(false);
  });
  it('does not describe unknown data as completed', () => {
    service.get.mockReturnValue(of({ ...sample, outstanding: 0, needsVerification: true, stages: [{ ...sample.stages[0], state: 'UNKNOWN', total: 0, outstanding: 0, issues: [] }] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Needs checking');
    expect(fixture.nativeElement.textContent).toContain('No qualifying records found');
  });
  it('filters action text without changing outstanding totals', () => {
    fixture.detectChanges();
    component.search = 'not-present';
    fixture.detectChanges();
    expect(component.visibleIssues(sample.stages[0])).toEqual([]);
    expect(component.data()?.outstanding).toBe(1);
    component.search = 'document reviewer';
    expect(component.visibleIssues(sample.stages[0])).toHaveLength(1);
  });
  it('rejects incomplete month input without making an API request', () => {
    fixture.detectChanges();
    service.get.mockClear();
    component.month = '2026-13';
    component.load();
    expect(service.get).not.toHaveBeenCalled();
    expect(component.error()).toContain('valid reporting month');
  });
});