import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { CcoEscalationsComponent } from './cco/escalations/cco-escalations.component';
import { CcoEscalationsApi } from '../core/api/cco-escalations.api';
import { ConfirmDialogService } from '../shared/ui/confirm-dialog/confirm-dialog.service';

afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-cco-test]').forEach(n => n.remove()); });
const row = {
  id: 'TEST-A', clientId: 'TEST-C', branchId: 'TEST-B', status: 'OPEN',
  client: { clientName: 'Synthetic client' }, branch: { branchName: 'Synthetic branch' },
  reason: 'Synthetic long reason '.repeat(20), riskScore: 83, slaOverdueCount: 2, createdAt: '2026-11-01',
};
for (const width of [390, 768, 1440]) {
  it('CCO scoped records, pagination and safe status recovery at ' + width + 'px', async () => {
    await page.viewport(width, 900);
    const reads: Subject<any>[] = [], writes: Subject<any>[] = [];
    const request = (a: Subject<any>[]) => { const s = new Subject<any>(); a.push(s); return s; };
    const api = { list: vi.fn(() => request(reads)), updateStatus: vi.fn(() => request(writes)) };
    const confirm = vi.fn(async () => true);
    await TestBed.configureTestingModule({
      imports: [CcoEscalationsComponent], providers: [
        provideZonelessChangeDetection(), { provide: CcoEscalationsApi, useValue: api },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(CcoEscalationsComponent);
    const h = document.createElement('app-cco-layout'); h.className = 'workspace-ui'; h.setAttribute('data-cco-test', '');
    document.body.append(h); h.append(f.nativeElement); f.detectChanges(); await f.whenStable();
    const respond = async (items: any[], total = items.length) => { reads.at(-1)!.next({ items, total, page: f.componentInstance.page, limit: 25 }); await f.whenStable(); };
    const button = (label: string) => Array.from(h.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === label)!;
    await respond([row], 26);
    expect(h.textContent).toContain('Synthetic client'); expect(h.textContent).toContain('Synthetic branch');
    expect(h.textContent).toContain(row.reason); expect(h.textContent).toContain('26 matching escalations');
    expect(h.textContent).toContain('1 Open on this page');
    expect(h.textContent).not.toContain('Assign'); expect(h.textContent).not.toContain('Notify');
    expect(h.querySelector('option[value="IN_PROGRESS"]')).toBeNull();
    expect(h.scrollWidth).toBeLessThanOrEqual(width + 1);
    button('Next').click(); await f.whenStable(); await respond([{ ...row, id: 'TEST-PAGE2' }], 26);
    expect(h.textContent).toContain('Page 2 of 2');
    const search = h.querySelector<HTMLInputElement>('#ce-search')!;
    search.value = 'TEST search'; search.dispatchEvent(new Event('input', { bubbles: true }));
    button('Search').click(); await f.whenStable(); expect(f.componentInstance.page).toBe(1);
    await respond([row]); button('Acknowledge').click(); await f.whenStable();
    expect(button('Acknowledge').disabled).toBe(true); expect(button('Close').disabled).toBe(true);
    button('Close').click(); expect(writes).toHaveLength(1);
    writes[0].error(Error('Synthetic response lost')); await f.whenStable();
    expect(h.textContent).toContain('could not be confirmed'); expect(button('Acknowledge').disabled).toBe(true);
    button('Refresh to confirm').click(); await f.whenStable(); await respond([{ ...row, status: 'ACK' }]);
    expect(button('Acknowledge').disabled).toBe(true); button('Close').click(); await f.whenStable();
    expect(confirm).toHaveBeenCalledTimes(1); expect(writes).toHaveLength(2);
    writes[1].next({ ...row, status: 'CLOSED' }); await f.whenStable(); await respond([{ ...row, status: 'CLOSED' }]);
    expect(button('Close').disabled).toBe(true);
    const status = h.querySelector<HTMLSelectElement>('#ce-status-filter')!; status.value = 'ACK'; status.dispatchEvent(new Event('change', { bubbles: true }));
    await f.whenStable(); reads.at(-1)!.error(Error('Synthetic outage')); await f.whenStable();
    expect(h.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(h.querySelector('.stats')).toBeNull(); expect(h.textContent).not.toContain('No escalations match');
    button('Retry escalations').click(); await f.whenStable(); await respond([]);
    expect(h.textContent).toContain('No escalations match'); expect(h.querySelector('[role="alert"]')).toBeNull();
    expect(h.scrollWidth).toBeLessThanOrEqual(width + 1); f.destroy();
  });
}
