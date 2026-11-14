import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { of, Subject } from 'rxjs';
import { BranchRegistrationsComponent } from './branch/branch-registrations/branch-registrations.component';
import { AuthService } from '../core/auth.service';
import { ClientBranchesService } from '../core/client-branches.service';
import { HelpdeskService } from '../core/helpdesk.service';
import { ToastService } from '../shared/toast/toast.service';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';

afterEach(() => TestBed.resetTestingModule());
describe.each([390, 768, 1440])('Branch registration request refresh at %ipx', width => {
  beforeEach(async () => page.viewport(width, 900));
  it('shows unavailable request counts after a failed refresh and restores them after retry', async () => {
    const pending = new Subject<any[]>();
    const failedRetry = new Subject<any[]>();
    const successfulRetry = new Subject<any[]>();
    const listTickets = vi.fn()
      .mockReturnValueOnce(of([{ id: 'TEST-TICKET', subCategory: 'REGISTRATION_APPLY', status: 'OPEN' }]))
      .mockReturnValueOnce(pending)
      .mockReturnValueOnce(failedRetry)
      .mockReturnValueOnce(successfulRetry)
      .mockReturnValue(of([]));
    const listRegistrations = vi.fn(() => of([{ id: 'TEST-REG', type: 'TEST ONLY', computedStatus: 'ACTIVE' }]));
    const getRegistrationAlerts = vi.fn(() => of([{ id: 'TEST-ALERT', registrationId: 'TEST-REG', title: 'Synthetic alert' }]));
    await TestBed.configureTestingModule({
      imports: [BranchRegistrationsComponent],
      providers: [
        { provide: AuthService, useValue: { getBranchIds: () => ['TEST-BRANCH'] } },
        { provide: ClientBranchesService, useValue: {
          list: () => of([{ id: 'TEST-BRANCH', name: 'Synthetic branch' }]),
          listRegistrations,
          getRegistrationAlerts,
        } },
        { provide: HelpdeskService, useValue: { listTickets } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: ProtectedFileService, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BranchRegistrationsComponent);
    const c = fixture.componentInstance;
    const render = async () => {
      fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
      await fixture.whenStable(); fixture.detectChanges();
    };
    await render();
    (c as any).loadRequests('TEST-REG');
    pending.error(new Error('Synthetic request history failure')); await render();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('could not be refreshed');
    const cards = [...root.querySelectorAll('.summary-card')];
    for (const label of ['Open Requests', 'Amendment Requests', 'Closure Requests']) {
      const card = cards.find(row => row.querySelector('.label')?.textContent?.trim() === label);
      expect(card?.querySelector('strong')?.textContent?.trim()).toBe('Unavailable');
    }
    expect(c.registrations[0].id).toBe('TEST-REG');
    expect(root.textContent).toContain('Request history unavailable');
    const exportButton = () => root.querySelector<HTMLButtonElement>('button[aria-label="Export Summary"]')!;
    expect(exportButton().disabled).toBe(true);
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    c.exportSelectedSummary();
    expect(createUrl).not.toHaveBeenCalled();
    const retry = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('Retry request history'))!;
    retry.click(); await render();
    expect(listRegistrations).toHaveBeenCalledTimes(1);
    expect(getRegistrationAlerts).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('Unavailable');
    expect(exportButton().disabled).toBe(true);
    c.exportSelectedSummary();
    expect(createUrl).not.toHaveBeenCalled();
    failedRetry.error(new Error('Synthetic repeated history failure')); await render();
    expect(c.registrations[0].id).toBe('TEST-REG');
    expect(c.selectedRegistration?.id).toBe('TEST-REG');
    expect(c.alerts[0].id).toBe('TEST-ALERT');
    expect(c.loadError).toBe('');
    expect(root.textContent).toContain('Unavailable');
    [...root.querySelectorAll('button')].find(button => button.textContent?.includes('Retry request history'))!.click();
    await render();
    successfulRetry.next([]); successfulRetry.complete(); await render();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(c.requestLoadError).toBe('');
    expect(c.openRequestCount).toBe(0);
    expect(c.registrations[0].id).toBe('TEST-REG');
    expect(root.textContent).not.toContain('Unavailable');
    expect(exportButton().disabled).toBe(false);
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    c.exportSelectedSummary();
    expect(download).toHaveBeenCalledTimes(1);
    const csv = await (createUrl.mock.calls[0][0] as Blob).text();
    expect(csv).toContain('"Open Requests","0"');
    expect(csv).toContain('"Linked Alerts","1"');
    download.mockRestore(); createUrl.mockRestore();
  });
});
