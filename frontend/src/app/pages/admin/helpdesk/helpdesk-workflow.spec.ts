import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { AdminHelpdeskDetailComponent } from './admin-helpdesk-detail.component';
import { AdminHelpdeskApiService } from './admin-helpdesk-api.service';
import { AdminUsersApi } from '../../../core/api/admin-users.api';
import { AuthService } from '../../../core/auth.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { PfTeamTicketDetailComponent } from '../../pf-team/tickets/pf-team-ticket-detail.component';
import { PfTeamApiService } from '../../pf-team/pf-team-api.service';

const baseTicket = {
  id: 'ticket', clientId: 'client', category: 'PF', status: 'IN_PROGRESS',
  assignedToUserId: 'pf', assigneeName: 'Previous name', priority: 'NORMAL',
  description: 'Sample ticket', createdAt: '2026-09-27T10:00:00Z',
};
const users = [
  { id: 'pf', name: 'PF Specialist', roleCode: 'PF_TEAM', isActive: true },
  { id: 'crm', name: 'CRM Specialist', roleCode: 'CRM', isActive: true },
  { id: 'admin', name: 'Administrator', roleCode: 'ADMIN', isActive: true },
  { id: 'inactive', name: 'Inactive PF', roleCode: 'PF_TEAM', isActive: false },
  ...['CLIENT', 'EMPLOYEE', 'CONTRACTOR', 'AUDITOR', 'PAYROLL', 'CEO'].map(roleCode => ({ id: roleCode, name: roleCode, roleCode })),
];

async function setup(pf = false, ticket = { ...baseTicket } as any) {
  const api = {
    getTicket: vi.fn(() => of(ticket)), getMessages: vi.fn(() => of([])),
    updateStatus: vi.fn((_id, status) => of({ ...ticket, status })),
    assignTicket: vi.fn((_id, assignedToUserId) => of({ ...ticket, assignedToUserId })),
    postMessage: vi.fn(() => of({})),
  };
  await TestBed.configureTestingModule({
    imports: [AdminHelpdeskDetailComponent, PfTeamTicketDetailComponent],
    providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'ticket' }) }, paramMap: of(convertToParamMap({ id: 'ticket' })) } },
      { provide: AdminHelpdeskApiService, useValue: api },
      { provide: PfTeamApiService, useValue: api },
      { provide: AdminUsersApi, useValue: { listUsersSimple: () => of(users) } },
      { provide: AuthService, useValue: { getUser: () => ({ id: 'pf' }) } },
      { provide: ProtectedFileService, useValue: { download: vi.fn(() => of(undefined)) } },
    ],
  }).compileComponents();
  const f = pf ? TestBed.createComponent(PfTeamTicketDetailComponent) : TestBed.createComponent(AdminHelpdeskDetailComponent);
  f.detectChanges(); await f.whenStable(); f.detectChanges();
  return { f, api, c: f.componentInstance };
}
afterEach(() => TestBed.resetTestingModule());

describe('Helpdesk assignment UI', () => {
  it.each(['PF', 'ESI', 'PAYSLIP', 'COMPLIANCE', 'AUDIT', 'GENERIC'])('limits assignee roles for %s', async category => {
    const { c, f } = await setup(false, { ...baseTicket, category });
    const admin = c as AdminHelpdeskDetailComponent;
    expect(admin.assignableUsers.map(u => u.id)).toEqual(['PF', 'ESI', 'PAYSLIP'].includes(category) ? ['pf'] : ['crm', 'admin']);
    expect(f.nativeElement.querySelectorAll('select option').length).toBe(admin.assignableUsers.length + 1);
  });
  it('blocks invalid assignees and displays the returned assignee name, then clears it on unassignment', async () => {
    const { c, api } = await setup(); const admin = c as AdminHelpdeskDetailComponent;
    admin.assignUserId = 'CLIENT'; admin.assignTicket(); expect(api.assignTicket).not.toHaveBeenCalled();
    admin.assignUserId = 'pf'; admin.assignTicket(); expect(admin.ticket?.assigneeName).toBe('PF Specialist');
    admin.unassignTicket(); expect(admin.ticket?.assignedToUserId).toBeNull(); expect(admin.ticket?.assigneeName).toBeNull();
  });
  it('displays assignment denial without pretending it saved', async () => {
    const { c, api, f } = await setup(false, { ...baseTicket, category: 'COMPLIANCE' });
    const admin = c as AdminHelpdeskDetailComponent;
    api.assignTicket.mockReturnValueOnce(throwError(() => ({ error: { message: 'Assignee is not assigned to this client' } })));
    admin.assignUserId = 'crm'; admin.assignTicket(); f.detectChanges();
    expect(admin.assigning).toBe(false); expect(admin.ticket?.assignedToUserId).toBe('pf');
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('not assigned');
  });
  it('prevents overlapping assignment and status requests', async () => {
    const { c, api } = await setup(); const admin = c as AdminHelpdeskDetailComponent;
    const pending = new Subject<any>(); api.assignTicket.mockReturnValueOnce(pending);
    admin.assignUserId = 'pf'; admin.assignTicket(); admin.changeStatus('RESOLVED'); admin.unassignTicket();
    expect(api.assignTicket).toHaveBeenCalledTimes(1); expect(api.updateStatus).not.toHaveBeenCalled();
    pending.next({ ...baseTicket }); pending.complete(); expect(admin.assigning).toBe(false);
  });
  it('shows a stale-update conflict and preserves the displayed status', async () => {
    const { c, api, f } = await setup();
    api.updateStatus.mockReturnValueOnce(throwError(() => ({ status: 409, error: { message: 'Ticket changed. Reload it before trying again.' } })));
    c.changeStatus('RESOLVED'); f.detectChanges();
    expect(c.ticket?.status).toBe('IN_PROGRESS'); expect(c.updatingStatus).toBe(false);
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('Reload');
  });
});

describe('PF Team ticket controls', () => {
  it.each([null, 'another-pf'])('does not offer mutations for tickets not assigned to the current user (%s)', async assignedToUserId => {
    const { c, api, f } = await setup(true, { ...baseTicket, assignedToUserId });
    const pf = c as PfTeamTicketDetailComponent;
    expect(pf.canManage).toBe(false); pf.changeStatus('RESOLVED'); pf.newMessage = 'test'; pf.postMessage();
    expect(api.updateStatus).not.toHaveBeenCalled(); expect(api.postMessage).not.toHaveBeenCalled();
    expect(Array.from(f.nativeElement.querySelectorAll('button')).every((button: any) => button.disabled)).toBe(true);
  });
  it('omits admin-only closure and prevents resolving directly from OPEN', async () => {
    const { c, api } = await setup(true, { ...baseTicket, status: 'OPEN' });
    const pf = c as PfTeamTicketDetailComponent;
    expect(pf.statuses).not.toContain('CLOSED'); pf.changeStatus('CLOSED'); pf.changeStatus('RESOLVED');
    expect(api.updateStatus).not.toHaveBeenCalled(); pf.changeStatus('IN_PROGRESS');
    expect(api.updateStatus).toHaveBeenCalledWith('ticket', 'IN_PROGRESS');
  });
  it('keeps an unsent message and displays its failure', async () => {
    const { c, api, f } = await setup(true); c.newMessage = 'Retain this reply';
    api.postMessage.mockReturnValueOnce(throwError(() => new Error('offline'))); c.postMessage(); f.detectChanges();
    expect(c.newMessage).toBe('Retain this reply'); expect(c.sendingMessage).toBe(false);
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('could not be sent');
  });
});

it.each([[390, false], [1440, false], [390, true], [1440, true]] as const)('keeps Helpdesk controls within the viewport at %ipx (PF: %s)', async (width, pf) => {
  await page.viewport(width, 1000);
  const { f } = await setup(pf); const host = f.nativeElement as HTMLElement;
  expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  for (const element of Array.from(host.querySelectorAll('input,select,button'))) {
    const rect = element.getBoundingClientRect();
    expect(rect.right).toBeLessThanOrEqual(width + 1); expect(rect.left).toBeGreaterThanOrEqual(0);
  }
  await page.screenshot({ element: host, path: `../../../../.vitest-attachments/helpdesk-${pf ? 'pf' : 'admin'}-${width}.png` });
});
