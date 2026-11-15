import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { SlaTrackerComponent } from '../shared/sla/sla-tracker.component';
import { ClientBranchesService } from '../core/client-branches.service';
import { AuthService } from '../core/auth.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';
import { AdminApiService } from '../core/admin-api.service';

afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-sla-test]').forEach(n => n.remove()); });
const branches = [{ id: 'TEST-A', name: 'Synthetic A' }, { id: 'TEST-B', name: 'Synthetic B' }];
const task = { id: 'TEST-CURRENT', title: 'Synthetic compliance task', status: 'OPEN', module: 'RETURNS', priority: 'HIGH', dueDate: '2026-11-30' };
for (const width of [390, 768, 1440]) {
  for (const role of ['Client', 'Branch', 'CRM']) {
    it(`${role} SLA filters, uncertain saves and recovery at ${width}px`, async () => {
      await page.viewport(width, 900);
      const reads: Subject<any>[] = [], writes: Subject<any>[] = [];
      const request = (list: Subject<any>[]) => { const s = new Subject<any>(); list.push(s); return s; };
      const getSlaTasks = vi.fn(() => request(reads)), updateSlaTask = vi.fn(() => request(writes));
      await TestBed.configureTestingModule({ imports: [SlaTrackerComponent], providers: [provideZonelessChangeDetection(),
        { provide: ClientBranchesService, useValue: { list: () => of(branches), getSlaTasks, updateSlaTask } },
        { provide: AuthService, useValue: { getRoleCode: () => role === 'CRM' ? 'CRM' : 'CLIENT', getBranchIds: () => role === 'Branch' ? ['TEST-A', 'TEST-B'] : [] } },
        { provide: CrmClientsApi, useValue: { getAssignedClients: () => of([{ id: 'TEST-C1', name: 'Synthetic client 1' }, { id: 'TEST-C2', name: 'Synthetic client 2' }]), getBranchesForClient: () => of(branches) } },
        { provide: AdminApiService, useValue: {} },
      ] }).compileComponents();
      const f = TestBed.createComponent(SlaTrackerComponent), c = f.componentInstance;
      const h = document.createElement('app-' + role.toLowerCase() + '-layout'); h.className = 'workspace-ui'; h.setAttribute('data-sla-test', ''); document.body.append(h); h.append(f.nativeElement);
      f.detectChanges(); await f.whenStable(); const old = reads[0];
      const select = (label: string, value: string) => { const el = h.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
      select('Branch', 'TEST-B'); await f.whenStable();
      if (role === 'CRM') { select('Client', 'TEST-C2'); await f.whenStable(); expect(c.clientId).toBe('TEST-C2'); }
      reads.at(-1)!.next({ items: [task] }); old.next({ items: [{ ...task, title: 'TEST-STALE' }] }); await f.whenStable();
      expect(h.textContent).toContain(task.title); expect(h.textContent).not.toContain('TEST-STALE'); expect(h.scrollWidth).toBeLessThanOrEqual(width + 1);
      const close = h.querySelector<HTMLButtonElement>('button.btn-close')!, progress = h.querySelector<HTMLButtonElement>('button.btn-progress')!;
      close.click(); await f.whenStable(); expect(close.disabled).toBe(true); expect(progress.disabled).toBe(true); close.click(); expect(writes).toHaveLength(1);
      writes[0].error(Error('Synthetic response lost')); await f.whenStable();
      expect(h.querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed'); expect(close.disabled).toBe(true);
      Array.from(h.querySelectorAll('button')).find(b => b.textContent?.includes('Refresh tasks'))!.click(); await f.whenStable();
      reads.at(-1)!.next({ items: [{ ...task }] }); await f.whenStable();
      h.querySelector<HTMLButtonElement>('button.btn-close')!.click(); await f.whenStable(); writes[1].next({ ...task, status: 'CLOSED' }); await f.whenStable();
      reads.at(-1)!.next({ items: [] }); await f.whenStable(); expect(h.textContent).toContain('No tasks found');
      select('Task status', 'CLOSED'); await f.whenStable(); reads.at(-1)!.next({ items: [{ ...task, status: 'CLOSED' }] }); await f.whenStable();
      expect(h.querySelector<HTMLButtonElement>('button.btn-close')!.disabled).toBe(true); expect(h.querySelector<HTMLButtonElement>('button.btn-progress')!.disabled).toBe(true);
      select('Compliance module', 'MCD'); await f.whenStable(); reads.at(-1)!.error(Error('Synthetic outage')); await f.whenStable();
      expect(h.textContent).toContain('SLA tasks could not be loaded'); expect(h.textContent).not.toContain('No tasks found');
      Array.from(h.querySelectorAll('button')).find(b => b.textContent?.includes('Retry tasks'))!.click(); await f.whenStable(); reads.at(-1)!.next({ items: [] }); await f.whenStable();
      expect(h.querySelector('[role="alert"]')).toBeNull(); expect(h.textContent).toContain('No tasks found'); expect(h.scrollWidth).toBeLessThanOrEqual(width + 1);
      select('Task status', 'OVERDUE'); await f.whenStable();
      reads.at(-1)!.next({ items: [{ ...task, status: 'OVERDUE', workflowStatus: 'IN_PROGRESS' }] }); await f.whenStable();
      expect(h.querySelector('.status-badge.OVERDUE')).not.toBeNull(); expect(h.querySelector('.status-badge.IN_PROGRESS')?.textContent).toBe('In Progress');
      expect(h.querySelector<HTMLButtonElement>('button.btn-progress')!.disabled).toBe(true); expect(h.querySelector<HTMLButtonElement>('button.btn-close')!.disabled).toBe(false);
      f.destroy();
    });
  }
}
