import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { of, Subject, throwError } from 'rxjs';
import { RegistrationRequestsComponent } from './registration-requests.component';
import { RegistrationRequestsApi } from './registration-requests.api';

function apiFixture() {
  const rows: any[] = [], messages: Record<string, any[]> = {};
  const api = {
    list: vi.fn((branch: string, scope: string) => of(rows.filter(r => r.branchId === branch && r.isTest === (scope === 'TEST')).map(r => ({ ...r })))),
    detail: vi.fn((id: string) => of({ ticket: { ...rows.find(r => r.id === id) }, messages: [...(messages[id] || [])] })),
    create: vi.fn((body: any) => {
      const ticket = { id: 'synthetic-request', branchId: body.branchId, clientId: 'synthetic-client', isTest: body.recordScope === 'TEST', status: 'OPEN', createdAt: '2026-01-01T09:00:00Z', description: `Registration Type: TEST ONLY — ${body.registrationType}\nAuthority: ${body.authority}\nNotes: ${body.notes}` };
      rows.push(ticket); messages[ticket.id] = []; return of({ ...ticket });
    }),
    action: vi.fn((ticket: any, _scope: string, action: string, remarks: string) => {
      const row = rows.find(r => r.id === ticket.id);
      if (row.status !== ticket.status) return throwError(() => ({ error: { message: 'Request changed' } }));
      row.status = ({ CORRECTION: 'AWAITING_CLIENT', RESUBMIT: 'IN_PROGRESS', REVIEW: 'IN_PROGRESS', APPROVE: 'RESOLVED' } as any)[action];
      messages[row.id].push({ id: 'message-' + messages[row.id].length, message: `[${action}] ${remarks}`, senderRole: action === 'RESUBMIT' ? 'CLIENT' : 'CRM', createdAt: '2026-01-01T10:00:00Z' });
      return of({ ...row });
    }),
  };
  return { api, rows, messages };
}
async function setup(api: any, reviewer = false) {
  await TestBed.configureTestingModule({ imports: [RegistrationRequestsComponent], providers: [{ provide: RegistrationRequestsApi, useValue: api }] }).compileComponents();
  const fixture = TestBed.createComponent(RegistrationRequestsComponent);
  fixture.componentRef.setInput('branchId', 'synthetic-branch'); fixture.componentRef.setInput('reviewer', reviewer);
  const c = fixture.componentInstance;
  const render = async () => { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await render();
  const root = fixture.nativeElement as HTMLElement;
  const click = async (label: string) => { const button = [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === label); expect(button, label).toBeTruthy(); expect(button!.disabled).toBe(false); button!.click(); await render(); };
  const fill = async (label: string, value: string) => { const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>('[aria-label="' + label + '"]')!; expect(input).toBeTruthy(); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await render(); };
  return { fixture, c, root, render, click, fill };
}
afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

describe.each([390, 768, 1440])('Isolated registration workflow at %ipx', width => {
  beforeEach(async () => page.viewport(width, 950));
  it.each(['LegitX', 'BranchDesk'])('submits from %s, corrects, approves in CRM and exports the full history without actual rows', async portal => {
    const h = apiFixture(); const ui = await setup(h.api);
    await ui.click('Open request review and corrections');
    expect(h.api.list).toHaveBeenLastCalledWith('synthetic-branch', 'ACTUAL', '');
    ui.c.scope = 'TEST'; ui.c.changeScope(); await ui.render();
    await ui.click('New application');
    await ui.fill('Registration type', 'Synthetic factory application'); await ui.fill('Authority', 'Synthetic authority'); await ui.fill('Application details', 'TEST ONLY ' + portal + '\nNo statutory submission');
    await ui.click('Submit application');
    expect(h.api.create.mock.calls[0][0].recordScope).toBe('TEST');
    expect(ui.root.textContent).toContain('1 test requests · 1 open');
    ui.fixture.componentRef.setInput('reviewer', true); await ui.render();
    ui.c.scope = 'TEST'; ui.c.changeScope(); await ui.render(); ui.c.select(h.rows[0]); await ui.render();
    await ui.fill('Review or correction remarks', 'Correct the authority address'); await ui.click('Request correction');
    expect(ui.root.textContent).toContain('Correction required');
    ui.fixture.componentRef.setInput('reviewer', false); await ui.render();
    ui.c.scope = 'TEST'; ui.c.changeScope(); await ui.render(); ui.c.select(h.rows[0]); await ui.render();
    expect(ui.root.textContent).toContain('[CORRECTION] Correct the authority address');
    await ui.fill('Review or correction remarks', 'Corrected synthetic address, "reviewed"\nSecond line preserved'); await ui.click('Resubmit correction');
    expect(ui.root.textContent).toContain('Under CRM review');
    ui.fixture.componentRef.setInput('reviewer', true); await ui.render();
    ui.c.scope = 'TEST'; ui.c.changeScope(); await ui.render(); ui.c.select(h.rows[0]); await ui.render();
    await ui.fill('Review or correction remarks', 'Approved corrected fixture; no licence issued'); await ui.click('Approve request');
    expect(ui.root.textContent).toContain('1 test requests · 0 open');
    for (const reviewer of [false, true]) {
      ui.fixture.componentRef.setInput('reviewer', reviewer); await ui.render();
      ui.c.scope = 'TEST'; ui.c.changeScope(); await ui.render(); ui.c.select(h.rows[0]); await ui.render();
      const url = vi.spyOn(URL, 'createObjectURL'); const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      await ui.click('Export review report');
      const report = await (url.mock.calls.at(-1)![0] as Blob).text();
      expect(report).toContain('TEST ONLY — NOT AN ACTUAL REGISTRATION');
      expect(report).toContain('[CORRECTION]'); expect(report).toContain('[RESUBMIT]'); expect(report).toContain('[APPROVE]');
      expect(report).toContain('Second line preserved'); expect(report).toContain('""reviewed""'); expect(report).toContain('Resolved');
      expect((download.mock.instances.at(-1) as HTMLAnchorElement)?.download).toContain('TEST');
      url.mockRestore(); download.mockRestore();
    }
    ui.c.scope = 'ACTUAL'; ui.c.changeScope(); await ui.render();
    expect(ui.root.textContent).toContain('0 actual requests · 0 open');
    expect(ui.root.textContent).not.toContain('Corrected synthetic'); expect(ui.c.selected).toBeNull();
    const rect = ui.root.getBoundingClientRect(); expect(rect.right).toBeLessThanOrEqual(width + 1);
    expect(ui.root.scrollWidth).toBeLessThanOrEqual(ui.root.clientWidth + 1);
  });
});

describe('Registration async recovery', () => {
  it('ignores old scope lists and details, and disables actions while a save is pending', async () => {
    const h = apiFixture(), ui = await setup(h.api, true);
    const first = new Subject<any[]>(); h.api.list.mockReturnValueOnce(first);
    ui.c.toggle(); await ui.render(); ui.c.scope = 'TEST'; ui.c.changeScope(); await ui.render();
    first.next([{ id: 'actual-stale' }]); expect(ui.c.rows).toEqual([]);
    const pending = new Subject<any>(); h.api.detail.mockReturnValueOnce(pending);
    ui.c.select({ id: 'stale-detail' } as any); ui.c.scope = 'ACTUAL'; ui.c.changeScope(); await ui.render();
    pending.next({ ticket: { id: 'stale-detail' }, messages: [] }); expect(ui.c.selected).toBeNull();
    h.rows.push({ id: 'fixture', branchId: 'synthetic-branch', isTest: false, status: 'OPEN', description: 'Registration Type: Synthetic' }); h.messages['fixture'] = [];
    ui.c.select(h.rows[0]); await ui.render(); ui.c.remarks = 'Review fixture';
    const action = new Subject<any>(); h.api.action.mockReturnValueOnce(action);
    ui.c.act('REVIEW'); await ui.render(); ui.c.act('REVIEW');
    expect(h.api.action).toHaveBeenCalledTimes(1); expect(ui.c.can('APPROVE')).toBe(false);
    ui.fixture.componentRef.setInput('branchId', 'different-branch'); await ui.render();
    action.next({ ...h.rows[0], status: 'IN_PROGRESS' }); await ui.render();
    expect(ui.c.selected).toBeNull(); expect(ui.c.rows).toEqual([]); expect(ui.c.busy).toBe(false);
  });
  it('preserves drafts on failed saves and blocks reports when history cannot be refreshed', async () => {
    const h = apiFixture(), ui = await setup(h.api); ui.c.toggle(); await ui.render();
    ui.c.draft = { registrationType: 'Synthetic', authority: 'Synthetic', notes: 'Preserve draft' };
    h.api.create.mockReturnValueOnce(throwError(() => new Error('offline'))); ui.c.create(); await ui.render();
    expect(ui.c.draft.notes).toBe('Preserve draft'); expect(ui.c.busy).toBe(false);
    h.rows.push({ id: 'fixture', branchId: 'synthetic-branch', isTest: false, status: 'AWAITING_CLIENT', description: 'Registration Type: Synthetic' }); h.messages['fixture'] = [];
    ui.c.select(h.rows[0]); await ui.render(); ui.c.remarks = 'Unsaved correction';
    h.api.action.mockReturnValueOnce(throwError(() => ({ error: { message: 'Save failed' } }))); ui.c.act('RESUBMIT'); await ui.render();
    expect(ui.c.remarks).toBe('Unsaved correction');
    h.api.list.mockReturnValueOnce(throwError(() => new Error('offline'))); ui.c.load(); await ui.render();
    expect(ui.root.textContent).toContain('unavailable'); expect(ui.root.textContent).not.toContain('0 actual requests');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); ui.c.exportReport(); expect(click).not.toHaveBeenCalled();
  });
  it('clears pending detail loading when the list is refreshed', async () => {
    const h = apiFixture(), ui = await setup(h.api); ui.c.toggle(); await ui.render();
    const pending = new Subject<any>(); h.api.detail.mockReturnValueOnce(pending);
    ui.c.select({ id: 'pending' } as any); expect(ui.c.detailLoading).toBe(true);
    ui.c.load(); await ui.render(); expect(ui.c.detailLoading).toBe(false);
    pending.next({ ticket: { id: 'pending' }, messages: [] }); expect(ui.c.selected).toBeNull();
  });
});
