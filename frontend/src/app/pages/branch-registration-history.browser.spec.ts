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

const ticket = (status = 'OPEN', registrationId = 'NEW') => ({
  id: 'TEST-REQUEST', subCategory: 'REGISTRATION_APPLY', status,
  description: `[REGISTRATION_REQUEST]\nAction: APPLY\nRegistration ID: ${registrationId}\nRegistration Type: TEST ONLY synthetic licence\nAuthority: TEST authority\nNotes: Synthetic request; no statutory submission`,
});
async function setup(registrations: any[] = [], tickets: any[] = []) {
  const helpdesk = { listTickets: vi.fn(() => of(tickets)), createTicket: vi.fn(() => of({ id: 'TEST-REQUEST' })) };
  const branches = { list: () => of([{ id: 'TEST-BRANCH', name: 'Synthetic branch' }]),
    listRegistrations: vi.fn(() => of(registrations)), getRegistrationAlerts: vi.fn(() => of([])) };
  await TestBed.configureTestingModule({
    imports: [BranchRegistrationsComponent],
    providers: [
      { provide: AuthService, useValue: { getBranchIds: () => ['TEST-BRANCH'] } },
      { provide: ClientBranchesService, useValue: branches },
      { provide: HelpdeskService, useValue: helpdesk },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
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
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, c, root, helpdesk, branches, render };
}
afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

describe.each([390, 768, 1440])('Branch request lifecycle at %ipx (isolated data)', width => {
  beforeEach(async () => page.viewport(width, 900));
  it('retains a new application in visible history before a registration exists, through review and resolution', async () => {
    const { c, root, helpdesk, render } = await setup();
    c.openRequestModal('APPLY');
    c.requestModel.registrationType = 'TEST ONLY synthetic licence';
    c.requestModel.authority = 'TEST authority';
    c.requestModel.notes = 'Synthetic request; no statutory submission';
    helpdesk.listTickets.mockReturnValue(of([ticket()]));
    c.submitRequest(); await render();
    expect(helpdesk.createTicket).toHaveBeenCalledTimes(1);
    const history = () => root.querySelector('[aria-label="Branch registration requests"]');
    expect(history()?.textContent).toContain('HD-TEST-REQ');
    expect(history()?.textContent).toContain('Raised');
    expect(c.totalCount).toBe(0); expect(c.openRequestCount).toBe(1);
    for (const [status, label] of [['AWAITING_CLIENT', 'Awaiting Branch Input'], ['IN_PROGRESS', 'Under Review'], ['RESOLVED', 'Resolved'], ['CLOSED', 'Closed']]) {
      helpdesk.listTickets.mockReturnValue(of([ticket(status)]));
      c.retryRequestHistory(); await render();
      expect(history()?.textContent).toContain(label);
      expect(history()?.textContent).toContain('TEST ONLY synthetic licence');
    }
    expect(c.openRequestCount).toBe(0);
    expect(root.textContent).toContain('No registrations found');
    const summary = history()!.querySelector('summary')!;
    summary.click(); await render();
    expect(history()?.textContent).toContain('Synthetic request; no statutory submission');
    const rect = history()!.getBoundingClientRect();
    expect(rect.right).toBeLessThanOrEqual(width + 1);
    expect(history()!.scrollWidth).toBeLessThanOrEqual(history()!.clientWidth + 1);
  });

  it('exports request history without a registration and blocks unavailable or stale history', async () => {
    const { c, root, helpdesk, render } = await setup([], [ticket('RESOLVED')]);
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const exportButton = () => root.querySelector<HTMLButtonElement>('button[aria-label="Export Requests"]')!;
    expect(exportButton()).not.toBeNull();
    exportButton().click(); await render();
    expect(click).toHaveBeenCalledTimes(1);
    const csv = await (createUrl.mock.calls[0][0] as Blob).text();
    expect(csv).toContain('RESOLVED'); expect(csv).toContain('HD-TEST-REQ');
    const pending = new Subject<any[]>(); helpdesk.listTickets.mockReturnValue(pending);
    c.retryRequestHistory(); await render();
    expect(exportButton().disabled).toBe(true);
    pending.error(new Error('Synthetic outage')); await render();
    expect(exportButton().disabled).toBe(true);
    expect(root.querySelector('[aria-label="Branch registration requests"]')?.textContent).toContain('unavailable');
    helpdesk.listTickets.mockReturnValue(of([])); c.branchId = 'TEST-B'; c.changeBranch(); await render();
    expect(root.textContent).not.toContain('HD-TEST-REQ');
    expect(exportButton().disabled).toBe(true);
  });
});

it('reports only open linked requests as open while retaining completed request history', async () => {
  const { c } = await setup([{ id: 'TEST-REG', type: 'TEST ONLY', computedStatus: 'ACTIVE' }],
    [ticket('OPEN', 'TEST-REG'), { ...ticket('CLOSED', 'TEST-REG'), id: 'TEST-CLOSED' }]);
  const createUrl = vi.spyOn(URL, 'createObjectURL');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  c.exportSelectedSummary();
  const csv = await (createUrl.mock.calls[0][0] as Blob).text();
  expect(csv).toContain('"Open Requests","1"');
  expect(csv).toContain('Status=CLOSED');
});

it('preserves multiline request details in history and safely quotes them in exports', async () => {
  const request = ticket();
  request.description = request.description.replace('Synthetic request; no statutory submission', '=TEST ONLY, "quoted"\nSecond line of synthetic details');
  const { c, root } = await setup([], [request]);
  expect(root.querySelector('.request-notes')?.textContent).toContain('Second line of synthetic details');
  const createUrl = vi.spyOn(URL, 'createObjectURL');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  c.exportRequests();
  const csv = await (createUrl.mock.calls[0][0] as Blob).text();
  expect(csv).toContain(`"'=TEST ONLY, ""quoted""\nSecond line of synthetic details"`);
});
