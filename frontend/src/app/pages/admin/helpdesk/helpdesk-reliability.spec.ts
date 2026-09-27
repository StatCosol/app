import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { AdminHelpdeskDetailComponent } from './admin-helpdesk-detail.component';
import { AdminHelpdeskComponent } from './admin-helpdesk.component';
import { AdminHelpdeskApiService } from './admin-helpdesk-api.service';
import { AdminUsersApi } from '../../../core/api/admin-users.api';
import { AuthService } from '../../../core/auth.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { PfTeamTicketDetailComponent } from '../../pf-team/tickets/pf-team-ticket-detail.component';
import { PfTeamTicketsComponent } from '../../pf-team/tickets/pf-team-tickets.component';
import { PfTeamApiService } from '../../pf-team/pf-team-api.service';

const ticket = (id = 'a') => ({ id, clientId: 'client', category: 'PF', status: 'IN_PROGRESS', assignedToUserId: 'pf', priority: 'NORMAL', description: 'Sample', createdAt: '2026-09-27T00:00:00Z' });
const attachment = { name: 'sample report.pdf', url: '/uploads/helpdesk/sample report.pdf' };
const message = { id: 'message', ticketId: 'a', message: 'Sample attachment', createdAt: '2026-09-27T00:00:00Z', attachments: [attachment] };

async function setup() {
  const params = new BehaviorSubject(convertToParamMap({ id: 'a' }));
  const api = {
    getTicket: vi.fn((id: string) => of(ticket(id))), getMessages: vi.fn(() => of([message])),
    postMessage: vi.fn(() => of({})), updateStatus: vi.fn(() => of(ticket())),
    getStats: vi.fn(() => of({ total: 0, categories: [] })),
    listTickets: vi.fn(() => of({ data: [], total: 0, page: 1, limit: 20 } as any)),
  };
  const files = { download: vi.fn(() => of(undefined)) };
  await TestBed.configureTestingModule({
    imports: [AdminHelpdeskDetailComponent, PfTeamTicketDetailComponent, AdminHelpdeskComponent, PfTeamTicketsComponent],
    providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: AdminHelpdeskApiService, useValue: api }, { provide: PfTeamApiService, useValue: api },
      { provide: AdminUsersApi, useValue: { listUsersSimple: () => of([]) } },
      { provide: AuthService, useValue: { getUser: () => ({ id: 'pf' }) } },
      { provide: ProtectedFileService, useValue: files },
    ],
  }).compileComponents();
  return { api, params, files };
}
function detail(pf: boolean) {
  const f = pf ? TestBed.createComponent(PfTeamTicketDetailComponent) : TestBed.createComponent(AdminHelpdeskDetailComponent);
  f.detectChanges(); return f;
}
afterEach(() => TestBed.resetTestingModule());

describe.each([false, true])('Helpdesk thread reliability (PF: %s)', pf => {
  it('renders attachment controls through the authenticated downloader', async () => {
    const { files } = await setup(); const f = detail(pf);
    const button = f.nativeElement.querySelector('[aria-label="Download sample report.pdf"]');
    expect(button).not.toBeNull(); button.click();
    expect(files.download).toHaveBeenCalledWith('/api/v1/files/download?p=' + encodeURIComponent(attachment.url), attachment.name);
    expect(f.nativeElement.querySelector('a[href*="uploads/helpdesk"]')).toBeNull();
  });
  it('distinguishes loading and failure from an empty thread and retries only the read', async () => {
    const { api } = await setup(); const pending = new Subject<any>(); api.getMessages.mockReturnValueOnce(pending);
    const f = detail(pf);
    expect(f.nativeElement.textContent).toContain('Loading messages');
    expect(f.nativeElement.textContent).not.toContain('No messages yet');
    pending.error(new Error('offline')); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Messages could not be loaded');
    expect(f.nativeElement.textContent).not.toContain('No messages yet');
    f.componentInstance.loadMessages(); f.detectChanges();
    expect(f.componentInstance.messages).toHaveLength(1);
    expect(api.postMessage).not.toHaveBeenCalled();
  });
  it('cancels old ticket and message requests when the route changes', async () => {
    const { api, params } = await setup(); const oldTicket = new Subject<any>();
    api.getTicket.mockReturnValueOnce(oldTicket);
    const f = detail(pf); params.next(convertToParamMap({ id: 'b' }));
    oldTicket.next(ticket('a')); expect(f.componentInstance.ticket?.id).toBe('b');
    const oldMessages = new Subject<any>(); api.getMessages.mockReturnValueOnce(oldMessages);
    f.componentInstance.loadMessages(); params.next(convertToParamMap({ id: 'c' }));
    oldMessages.next([{ ...message, message: 'Previous ticket content' }]);
    expect(f.componentInstance.ticket?.id).toBe('c');
    expect(f.componentInstance.messages[0].message).toBe(message.message);
  });
  it('ignores a previous ticket action response and cancels requests on destroy', async () => {
    const { api, params } = await setup(); const reply = new Subject<any>(); api.postMessage.mockReturnValueOnce(reply);
    const f = detail(pf); f.componentInstance.newMessage = 'First draft'; f.componentInstance.postMessage();
    params.next(convertToParamMap({ id: 'b' })); f.componentInstance.newMessage = 'Second draft';
    reply.next({}); expect(f.componentInstance.newMessage).toBe('Second draft');
    expect(api.getMessages).toHaveBeenCalledTimes(2);
    const pending = new Subject<any>(); api.getMessages.mockReturnValueOnce(pending); f.componentInstance.loadMessages();
    f.destroy(); expect(pending.observed).toBe(false);
  });
  it('shows a retryable ticket failure instead of an endless spinner', async () => {
    const { api } = await setup(); api.getTicket.mockReturnValueOnce(throwError(() => ({ status: 503 })));
    const f = detail(pf); expect(f.componentInstance.ticket).toBeNull();
    expect(f.nativeElement.textContent).toContain('Retry ticket');
    f.componentInstance.loadTicket(); expect(f.componentInstance.ticket?.id).toBe('a');
  });
});

describe('Helpdesk lists', () => {
  it('cancels stale admin filter requests and keeps stats errors separate', async () => {
    const { api } = await setup(); const old = new Subject<any>(); api.listTickets.mockReturnValueOnce(old);
    api.getStats.mockReturnValueOnce(throwError(() => new Error('Stats unavailable')));
    const f = TestBed.createComponent(AdminHelpdeskComponent); f.detectChanges();
    api.listTickets.mockReturnValueOnce(of({ data: [ticket('new')], total: 1 }));
    f.componentInstance.filterCategory = 'PF'; f.componentInstance.reload();
    old.next({ data: [ticket('old')], total: 99 });
    expect(f.componentInstance.tickets[0].id).toBe('new');
    expect(f.componentInstance.statsError).toContain('stats');
    expect(f.componentInstance.loadError).toBe('');
  });
  it('clears failed admin pages and recovers when the final page shrinks', async () => {
    const { api } = await setup(); const f = TestBed.createComponent(AdminHelpdeskComponent); f.detectChanges();
    api.listTickets.mockReturnValueOnce(throwError(() => new Error('offline')));
    f.componentInstance.loadTickets(); f.detectChanges();
    expect(f.componentInstance.tickets).toEqual([]); expect(f.nativeElement.textContent).not.toContain('No tickets found');
    f.componentInstance.currentPage = 4;
    api.listTickets.mockReturnValueOnce(of({ data: [], total: 21 })).mockReturnValueOnce(of({ data: [ticket('last')], total: 21 }));
    f.componentInstance.loadTickets();
    expect(f.componentInstance.currentPage).toBe(2); expect(f.componentInstance.tickets[0].id).toBe('last');
    expect(api.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });
  it('paginates the complete PF result and filters records beyond the first page', async () => {
    const { api } = await setup(); const rows = Array.from({ length: 123 }, (_, i) => ({ ...ticket(String(i)), priority: i === 122 ? 'CRITICAL' : 'NORMAL' }));
    api.listTickets.mockReturnValueOnce(of(rows));
    const f = TestBed.createComponent(PfTeamTicketsComponent); f.detectChanges(); const c = f.componentInstance;
    const seen: string[] = [];
    for (let p = 1; p <= c.totalPages; p++) { c.goToPage(p); seen.push(...c.pageTickets.map(t => t.id)); }
    expect(seen).toHaveLength(123); expect(new Set(seen).size).toBe(123);
    c.filterPriority = 'CRITICAL'; c.applyFilter(); expect(c.currentPage).toBe(1); expect(c.pageTickets.map(t => t.id)).toEqual(['122']);
  });
  it('renders a PF list error with retry, not an empty result', async () => {
    const { api } = await setup(); api.listTickets.mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of([ticket()]));
    const f = TestBed.createComponent(PfTeamTicketsComponent); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Retry tickets'); expect(f.nativeElement.textContent).not.toContain('No tickets found');
    f.componentInstance.loadTickets(); expect(f.componentInstance.pageTickets).toHaveLength(1);
  });
});

it.each([390, 1440])('wraps long attachment filenames at %ipx', async width => {
  await page.viewport(width, 1000); const { api } = await setup();
  api.getMessages.mockReturnValueOnce(of([{ ...message, attachments: [{ ...attachment, name: 'support-document-'.repeat(18) + '.pdf' }] }]));
  const f = detail(false); await f.whenStable(); f.detectChanges(); const host = f.nativeElement as HTMLElement;
  expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  const button = host.querySelector('app-helpdesk-attachments button')!;
  expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(width);
  button.scrollIntoView({ block: 'center' });
  await page.screenshot({ element: host.querySelector('app-helpdesk-attachments')!, path: `../../../../.vitest-attachments/helpdesk-attachments-${width}.png` });
});
