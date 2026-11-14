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
    const listTickets = vi.fn()
      .mockReturnValueOnce(of([{ id: 'TEST-TICKET', subCategory: 'REGISTRATION_APPLY', status: 'OPEN' }]))
      .mockReturnValueOnce(pending)
      .mockReturnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [BranchRegistrationsComponent],
      providers: [
        { provide: AuthService, useValue: { getBranchIds: () => ['TEST-BRANCH'] } },
        { provide: ClientBranchesService, useValue: {
          list: () => of([{ id: 'TEST-BRANCH', name: 'Synthetic branch' }]),
          listRegistrations: () => of([{ id: 'TEST-REG', type: 'TEST ONLY', computedStatus: 'ACTIVE' }]),
          getRegistrationAlerts: () => of([]),
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
    const retry = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('Retry request history'))!;
    retry.click(); await render();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(c.requestLoadError).toBe('');
    expect(c.openRequestCount).toBe(0);
    expect(c.registrations[0].id).toBe('TEST-REG');
    expect(root.textContent).not.toContain('Unavailable');
  });
});
