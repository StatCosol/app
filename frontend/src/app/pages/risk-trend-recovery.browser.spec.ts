import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { RiskTrendComponent } from '../shared/risk/risk-trend.component';
import { ClientBranchesService } from '../core/client-branches.service';
import { AuthService } from '../core/auth.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';
import { AdminApiService } from '../core/admin-api.service';

afterEach(() => { TestBed.resetTestingModule(); document.querySelectorAll('[data-risk-test]').forEach(n => n.remove()); });
const branches = [{ id: 'TEST-A', name: 'Synthetic A' }, { id: 'TEST-B', name: 'Synthetic B' }];
for (const width of [390, 768, 1440]) {
  for (const role of ['Client', 'Branch', 'CRM']) {
    it(`${role} risk scope, recovery and accessible date controls at ${width}px`, async () => {
      await page.viewport(width, 900);
      const reads: Subject<any>[] = [];
      const getRiskTrend = vi.fn(() => { const s = new Subject<any>(); reads.push(s); return s; });
      await TestBed.configureTestingModule({
        imports: [RiskTrendComponent],
        providers: [provideZonelessChangeDetection(),
          { provide: ClientBranchesService, useValue: { list: () => of(branches), getRiskTrend } },
          { provide: AuthService, useValue: { getRoleCode: () => role === 'CRM' ? 'CRM' : 'CLIENT', getBranchIds: () => role === 'Branch' ? ['TEST-A', 'TEST-B'] : [] } },
          { provide: CrmClientsApi, useValue: { getAssignedClients: () => of([{ id: 'TEST-CLIENT-A', name: 'Synthetic client A' }, { id: 'TEST-CLIENT-B', name: 'Synthetic client B' }]), getBranchesForClient: () => of(branches) } },
          { provide: AdminApiService, useValue: {} },
        ],
      }).compileComponents();
      const f = TestBed.createComponent(RiskTrendComponent), c = f.componentInstance;
      const host = document.createElement('app-' + role.toLowerCase() + '-layout');
      host.className = 'workspace-ui'; host.setAttribute('data-risk-test', ''); document.body.append(host); host.append(f.nativeElement);
      f.detectChanges(); await f.whenStable();
      const old = reads[0], branch = host.querySelector<HTMLSelectElement>('select[aria-label="Branch"]')!;
      branch.value = 'TEST-B'; branch.dispatchEvent(new Event('change', { bubbles: true })); await f.whenStable();
      if (role === 'CRM') {
        const client = host.querySelector<HTMLSelectElement>('select[aria-label="Client"]')!;
        client.value = 'TEST-CLIENT-B'; client.dispatchEvent(new Event('change', { bubbles: true })); await f.whenStable();
      }
      reads.at(-1)!.next({ points: [{ date: '2026-11-10', riskScore: 20 }] });
      old.next({ points: [{ date: '2026-10-10', riskScore: 90 }] }); await f.whenStable();
      expect(host.textContent).toContain('20%'); expect(host.textContent).not.toContain('90%');
      expect(host.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(host.querySelector('label[for="rt-from"]')?.textContent).toContain('From');
      expect(host.querySelector('label[for="rt-to"]')?.textContent).toContain('To');
      c.load(); reads.at(-1)!.error(Error('Synthetic outage')); await f.whenStable();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
      expect(host.querySelector('.empty')).toBeNull(); expect(host.querySelector('table')).toBeNull();
      const retry = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Retry risk history'))!;
      retry.click(); await f.whenStable(); reads.at(-1)!.next({ points: [] }); await f.whenStable();
      expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain('No risk snapshots');
      const count = reads.length;
      const from = host.querySelector<HTMLInputElement>('#rt-from')!;
      from.value = ''; from.dispatchEvent(new Event('input', { bubbles: true })); from.dispatchEvent(new Event('change', { bubbles: true })); await f.whenStable();
      expect(reads).toHaveLength(count); expect(host.querySelector('[role="alert"]')?.textContent).toContain('valid date range');
      expect(host.scrollWidth).toBeLessThanOrEqual(width + 1);
      f.destroy();
    });
  }
}
