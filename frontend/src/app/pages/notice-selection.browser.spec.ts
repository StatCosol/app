import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { of, Subject } from 'rxjs';
import { ClientNoticesComponent } from './client/notices/client-notices.component';
import { BranchNoticesComponent } from './branch/notices/branch-notices.component';
import { CrmNoticesComponent } from './crm/notices/crm-notices.component';
import { NoticesService } from '../core/notices.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';

const notice = (id: string) => ({ id, noticeCode: `TEST-${id}`, subject: `TEST ONLY notice ${id}`, clientId: 'TEST-CLIENT', branchId: 'TEST-BRANCH', client: { clientName: 'TEST ONLY client' }, branch: { branchName: 'TEST ONLY branch' }, departmentName: 'TEST ONLY department', referenceNo: `TEST-REFERENCE-${id}`, noticeType: 'GENERAL', status: 'RECEIVED', severity: 'LOW', noticeDate: '2026-01-01', receivedDate: '2026-01-01', description: `TEST ONLY detail ${id}`, documents: [{ fileName: `TEST ONLY document ${id}.pdf`, fileUrl: `#TEST-${id}`, uploadedAt: '2026-01-01', documentType: 'OTHER' }] });
const zeroKpis = { total: 2, received: 2, underReview: 0, actionRequired: 0, responseDrafted: 0, responseSubmitted: 0, closed: 0, escalated: 0, overdue: 0, critical: 0 };
afterEach(() => TestBed.resetTestingModule());

describe.each([390, 768, 1440])('Notice detail selection at %ipx', width => {
  beforeEach(async () => page.viewport(width, 900));
  it.each(['client', 'branch', 'crm'] as const)('%s renders the selected evidence only, pending and failed states, scoped retry and close', async role => {
    const pending: Subject<any>[] = [];
    const getOne = vi.fn(() => { const s = new Subject<any>(); pending.push(s); return s; });
    const api = {
      [`${role}List`]: vi.fn(() => of([notice('A'), notice('B')])),
      [`${role}Kpis`]: vi.fn(() => of(zeroKpis)),
      [`${role}GetOne`]: getOne,
    };
    const component: any = role === 'client' ? ClientNoticesComponent : role === 'branch' ? BranchNoticesComponent : CrmNoticesComponent;
    await TestBed.configureTestingModule({ imports: [component], providers: [
      { provide: NoticesService, useValue: api },
      { provide: CrmClientsApi, useValue: { getAssignedClients: () => of([{ id: 'TEST-CLIENT', clientName: 'TEST ONLY client' }]) } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent<any>(component), c = fixture.componentInstance;
    const render = async () => {
      fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
      await Promise.resolve(); await Promise.resolve(); fixture.detectChanges();
    };
    await render();
    const root = fixture.nativeElement as HTMLElement;
    const select = (id: string) => role === 'crm' ? c.selectNotice(notice(id)) : c.toggleNotice(notice(id));
    const finish = (i: number, id: string) => { pending[i].next(notice(id)); pending[i].complete(); };
    select('A'); finish(0, 'A'); await render();
    expect(root.textContent).toContain('TEST ONLY document A.pdf');
    select('B'); await render();
    expect(root.textContent).not.toContain('TEST ONLY document A.pdf');
    expect(c.detailLoading).toBe(true);
    expect(root.textContent).toMatch(/loading.*detail|loading.*notice/i);
    pending[1].error(new Error('TEST ONLY detail unavailable')); await render();
    expect(c.detailError).toBeTruthy();
    expect(root.textContent).not.toContain('TEST ONLY document A.pdf');
    const retry = [...root.querySelectorAll('button')].find(button => /retry/i.test(button.textContent || '') && !button.disabled);
    expect(retry).toBeTruthy(); retry!.click(); await render();
    expect(getOne).toHaveBeenLastCalledWith('B');
    finish(2, 'B'); await render();
    expect(root.textContent).toContain('TEST ONLY document B.pdf');
    expect(root.textContent).not.toContain('TEST ONLY document A.pdf');
    expect(c.detailError).toBeFalsy();
    select('A'); await render(); c.closeDetail(); finish(3, 'A'); await render();
    expect(root.textContent).not.toContain('TEST ONLY document A.pdf');
    expect(root.textContent).not.toContain('TEST ONLY document B.pdf');
    expect(c.detailLoading).toBe(false);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 2);
    expect(api[`${role}List`]).toHaveBeenCalledTimes(1);
  });
});
