import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { ComplianceCalendarComponent } from '../shared/calendar/compliance-calendar.component';
import { ClientComplianceRemindersComponent } from './client/reminders/client-compliance-reminders.component';
import { ClientBranchesService } from '../core/client-branches.service';
import { ClientVisibilityService } from '../core/client-visibility.service';
import { AuthService } from '../core/auth.service';
import { CrmService } from '../core/crm.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';

afterEach(() => {
  TestBed.resetTestingModule();
  document.querySelectorAll('[data-calendar-test]').forEach(n => n.remove());
});
function host(element: HTMLElement) {
  const h = document.createElement('main'); h.className = 'workspace-ui';
  h.setAttribute('data-calendar-test', ''); document.body.append(h); h.append(element); return h;
}
function select(h: HTMLElement, label: string, value: string) {
  const el = h.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
}
const branches = [{ id: 'TEST-A', branchName: 'Synthetic A' }, { id: 'TEST-B', branchName: 'Synthetic B' }];

for (const width of [390, 768, 1440]) {
  for (const role of ['Client', 'Branch', 'CRM']) {
    it(`${role} calendar selection, unavailable/retry and layouts at ${width}px`, async () => {
      await page.viewport(width, 900);
      const reads: Subject<any>[] = [];
      const getCalendar = vi.fn(() => { const s = new Subject<any>(); reads.push(s); return s; });
      await TestBed.configureTestingModule({
        imports: [ComplianceCalendarComponent],
        providers: [provideZonelessChangeDetection(),
          { provide: ClientBranchesService, useValue: { list: () => of(branches), getCalendar } },
          { provide: AuthService, useValue: { getRoleCode: () => role === 'CRM' ? 'CRM' : 'CLIENT', getBranchIds: () => role === 'Branch' ? ['TEST-A', 'TEST-B'] : [] } },
          { provide: CrmService, useValue: { getAssignedClientsCached: () => of([{ id: 'TEST-CLIENT-A', name: 'Synthetic client A' }, { id: 'TEST-CLIENT-B', name: 'Synthetic client B' }]) } },
          { provide: CrmClientsApi, useValue: { getBranchesForClient: () => of(branches) } },
        ],
      }).compileComponents();
      const f = TestBed.createComponent(ComplianceCalendarComponent), c = f.componentInstance, h = host(f.nativeElement);
      f.detectChanges(); await f.whenStable();
      const old = reads[0];
      select(h, 'Branch', 'TEST-B'); await f.whenStable();
      if (role === 'CRM') { select(h, 'Client', 'TEST-CLIENT-B'); await f.whenStable(); }
      const date = c.month + '-10';
      reads.at(-1)!.next({ items: [{ date, title: 'TEST-current-' + 'longtitle'.repeat(50), module: 'RETURNS', priority: 'HIGH', branchName: 'Synthetic B' }] });
      old.next({ items: [{ date, title: 'TEST-stale', module: 'RETURNS' }] });
      await f.whenStable();
      expect(h.textContent).toContain('TEST-current'); expect(h.textContent).not.toContain('TEST-stale');
      expect(h.scrollWidth).toBeLessThanOrEqual(width + 1);
      (h.querySelector('button[title="List view"]') as HTMLButtonElement).click(); await f.whenStable();
      expect(h.querySelector('.cal-list')).not.toBeNull(); expect(h.scrollWidth).toBeLessThanOrEqual(width + 1);
      select(h, 'Compliance module', 'RETURNS'); await f.whenStable();
      reads.at(-1)!.error(Error('Synthetic outage')); await f.whenStable();
      expect(h.querySelector('[role=alert]')?.textContent).toContain('Retry');
      expect(h.textContent).not.toContain('No calendar items'); expect(h.querySelector('.cal-stats')).toBeNull();
      const retry = Array.from(h.querySelectorAll('button')).find(b => b.textContent?.includes('Retry calendar'))!;
      retry.click(); await f.whenStable();
      reads.at(-1)!.next({ items: [] }); await f.whenStable();
      expect(h.querySelector('[role=alert]')).toBeNull(); expect(h.textContent).toContain('No calendar items');
      const month = h.querySelector<HTMLInputElement>('input[type=month]')!;
      month.value = ''; month.dispatchEvent(new Event('input', { bubbles: true })); month.dispatchEvent(new Event('change', { bubbles: true }));
      await f.whenStable(); expect(h.querySelector('[role=alert]')?.textContent).toContain('valid month');
      f.destroy();
    });
  }
  it(`Client reminders preserve the selected branch and recover at ${width}px`, async () => {
    await page.viewport(width, 900); const reads: Subject<any>[] = [];
    await TestBed.configureTestingModule({
      imports: [ClientComplianceRemindersComponent],
      providers: [provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: { get: () => of(branches) } },
        { provide: ClientVisibilityService, useValue: { getReminders: () => { const s = new Subject<any>(); reads.push(s); return s; } } },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(ClientComplianceRemindersComponent), h = host(f.nativeElement);
    f.detectChanges(); await f.whenStable(); select(h, 'Branch', 'TEST-B'); await f.whenStable();
    reads[1].next([{ title: 'TEST-current', days_left: 7, due_date: '2026-11-22', reminder_type: 'RETURN_DUE', branch_name: 'Synthetic B' }]);
    reads[0].next([{ title: 'TEST-stale' }]); await f.whenStable();
    expect(h.textContent).toContain('TEST-current'); expect(h.textContent).not.toContain('TEST-stale');
    select(h, 'Branch', 'TEST-A'); await f.whenStable(); reads[2].error(Error('Synthetic outage')); await f.whenStable();
    expect(h.querySelector('[role=alert]')?.textContent).toContain('Retry');
    expect(h.textContent).not.toContain('No upcoming');
    Array.from(h.querySelectorAll('button')).find(b => b.textContent?.includes('Retry reminders'))!.click();
    await f.whenStable(); reads[3].next([]); await f.whenStable();
    expect(h.textContent).toContain('No upcoming'); expect(h.scrollWidth).toBeLessThanOrEqual(width + 1);
    f.destroy();
  });
}
