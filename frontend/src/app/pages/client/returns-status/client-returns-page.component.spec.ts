import { ChangeDetectionStrategy, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { ClientReturnsPageComponent } from './client-returns-page.component';
import { ReturnsService } from '../../../core/returns.service';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { AuthService } from '../../../core/auth.service';

describe('Returns Status asynchronous first load', () => {
  function setup() {
    const returns = new Subject<any[]>();
    const branches = new Subject<any[]>();
    const getClientReturns = vi.fn(() => returns);
    TestBed.configureTestingModule({
      imports: [ClientReturnsPageComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ReturnsService, useValue: { getClientReturns } },
        { provide: ClientComplianceService, useValue: { getBranches: () => branches } },
        { provide: AuthService, useValue: { getUser: () => ({ clientId: 'company' }) } },
      ],
    }).overrideComponent(ClientReturnsPageComponent, { set: { changeDetection: ChangeDetectionStrategy.OnPush } });
    const fixture = TestBed.createComponent(ClientReturnsPageComponent);
    fixture.detectChanges();
    return { fixture, returns, branches, getClientReturns };
  }
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it('renders delayed rows and branches without another click or manual detection', async () => {
    const { fixture, returns, branches, getClientReturns } = setup();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Loading returns');
    branches.next([{ id: 'branch', name: 'Hayathabad' }]); branches.complete();
    returns.next([{ branch_name: 'Hayathabad', law_type: 'LWF', return_type: 'LWF_HY_RETURN', period_label: 'H2 FY2026-27', due_date: '2027-04-30', status: 'PENDING' }]);
    returns.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('LWF_HY_RETURN');
    expect(fixture.nativeElement.querySelector('select').textContent).toContain('Hayathabad');
    expect(fixture.nativeElement.textContent).not.toContain('Loading returns');
    expect(getClientReturns).toHaveBeenCalledTimes(1);
    expect(getClientReturns).toHaveBeenCalledWith('company', undefined);
  });
  it('clears the spinner after an empty asynchronous response', async () => {
    const { fixture, returns } = setup();
    await fixture.whenStable();
    returns.next([]); returns.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No returns found');
    expect(fixture.nativeElement.textContent).not.toContain('Loading returns');
  });
  it('clears the spinner after asynchronous failures without another click', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fixture, returns, branches } = setup();
    await fixture.whenStable();
    returns.error(new Error('Test unavailable')); branches.error(new Error('Test unavailable'));
    await fixture.whenStable();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Loading returns');
  });
});
