import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ClientRegistersComponent } from './client-registers.component';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

describe('Register preparation and approval status', () => {
  afterEach(() => vi.useRealTimers());
  const approved = (id = 'approved') => ({ id, title: 'Wages register', sourceType: 'GENERATED', approvalStatus: 'APPROVED', fileName: id + '.xlsx' });
  function setup(get: any, branch = true) {
    const files = { download: vi.fn(() => of(undefined)), fetch: vi.fn() };
    TestBed.configureTestingModule({ imports: [ClientRegistersComponent], providers: [
      { provide: HttpClient, useValue: { get } },
      { provide: AuthService, useValue: { isBranchUser: () => branch } },
      { provide: ClientBranchesService, useValue: { list: () => of([]) } },
      { provide: ToastService, useValue: { error: vi.fn() } },
      { provide: ProtectedFileService, useValue: files },
    ] });
    const fixture = TestBed.createComponent(ClientRegistersComponent);
    const c = fixture.componentInstance;
    c.q = { periodYear: 2026, periodMonth: 3, branchId: 'brm', category: 'REGISTER', sourceType: 'GENERATED', search: '' };
    fixture.detectChanges();
    return { fixture, c, files };
  }
  const packButton = (fixture: any) => Array.from(fixture.nativeElement.querySelectorAll('button')).find((button: any) => button.textContent.includes('Download ZIP')) as HTMLButtonElement;

  it('shows March saved/pending counts and approval instructions without exposing pending files', () => {
    const get = vi.fn((url: string) => of(url.endsWith('/availability') ? { total: 16, approved: 0, pending: 16, rejected: 0 } : []));
    const { fixture, c } = setup(get);
    expect(fixture.nativeElement.textContent).toContain('Saved: 16');
    expect(fixture.nativeElement.textContent).toContain('Awaiting approval: 16');
    expect(fixture.nativeElement.textContent).toContain('Registers Awaiting Payroll Approval');
    expect(fixture.nativeElement.textContent).toContain('Ask Payroll to review and approve');
    expect(c.filteredRows).toEqual([]); expect(packButton(fixture).disabled).toBe(true);
    expect(get.mock.calls.every((call: any) => call[1].params.get('periodMonth') === '3')).toBe(true);
  });

  it('distinguishes a month with no saved registers from one awaiting approval', () => {
    const { fixture } = setup(vi.fn((url: string) => of(url.endsWith('/availability') ? { total: 0, approved: 0, pending: 0, rejected: 0 } : [])));
    expect(fixture.nativeElement.textContent).toContain('No registers have been saved');
    expect(fixture.nativeElement.textContent).not.toContain('Registers Awaiting Payroll Approval');
  });

  it('shows correction guidance for rejected registers', () => {
    const { fixture } = setup(vi.fn((url: string) => of(url.endsWith('/availability') ? { total: 2, approved: 0, pending: 0, rejected: 2 } : [])));
    expect(fixture.nativeElement.textContent).toContain('Registers Need Correction');
    expect(fixture.nativeElement.textContent).toContain('Needs correction: 2');
  });

  it('keeps approved downloads available when status loading fails, without claiming files were never prepared', () => {
    const { fixture, c, files } = setup(vi.fn((url: string) => url.endsWith('/availability') ? throwError(() => new Error('offline')) : of([approved()])));
    expect(c.filteredRows.map(r => r.id)).toEqual(['approved']);
    expect(fixture.nativeElement.textContent).toContain('approval status could not be loaded');
    expect(fixture.nativeElement.textContent).not.toContain('No registers have been saved');
    expect(packButton(fixture).disabled).toBe(false);
    c.download(c.filteredRows[0]); expect(files.download).toHaveBeenCalled();
  });

  it('refreshes approval status and enables downloads when Payroll approves the files', () => {
    let released = false;
    const get = vi.fn((url: string) => of(url.endsWith('/availability') ?
      { total: 16, approved: released ? 16 : 0, pending: released ? 0 : 16, rejected: 0 } :
      released ? Array.from({ length: 16 }, (_, index) => approved(String(index))) : []));
    const { fixture, c } = setup(get);
    released = true; c.reload(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Approved: 16');
    expect(fixture.nativeElement.textContent).not.toContain('Registers Awaiting Payroll Approval');
    expect(c.filteredRows.length).toBe(16); expect(packButton(fixture).disabled).toBe(false);
  });

  it('cancels stale results and automatically requests the selected branch, period, source and search', () => {
    vi.useFakeTimers();
    const oldRows = new Subject<any>(), oldCounts = new Subject<any>();
    let first = true;
    const get = vi.fn((url: string) => first ? (url.endsWith('/availability') ? oldCounts : oldRows) :
      of(url.endsWith('/availability') ? { total: 0, approved: 0, pending: 0, rejected: 0 } : []));
    const { fixture, c } = setup(get);
    first = false; c.q.periodMonth = 4; c.q.branchId = 'next-branch'; c.q.sourceType = 'MANUAL'; c.q.search = 'wages';
    c.onFiltersChange();
    oldRows.next([approved('stale')]); oldRows.complete();
    oldCounts.next({ total: 16, approved: 0, pending: 16, rejected: 0 }); oldCounts.complete();
    expect(c.availability).toBe(null); expect(c.rows).toEqual([]);
    vi.advanceTimersByTime(200); fixture.detectChanges();
    expect(c.availability?.total).toBe(0);
    for (const call of get.mock.calls.slice(-2) as any[]) {
      expect(call[1].params.get('periodMonth')).toBe('4');
      expect(call[1].params.get('branchId')).toBe('next-branch');
      expect(call[1].params.get('sourceType')).toBe('MANUAL');
      expect(call[1].params.get('search')).toBe('wages');
    }
  });

  it('keeps pending evidence visible to LegitX master users while displaying its approval status', () => {
    const { c, fixture } = setup(vi.fn((url: string) => of(url.endsWith('/availability') ?
      { total: 1, approved: 0, pending: 1, rejected: 0 } :
      [{ ...approved('pending'), approvalStatus: 'PENDING' }])), false);
    expect(c.filteredRows.map(r => r.id)).toEqual(['pending']);
    expect(fixture.nativeElement.textContent).toContain('Awaiting approval: 1');
  });
});
