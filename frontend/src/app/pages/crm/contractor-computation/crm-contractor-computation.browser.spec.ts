import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { CrmService } from '../../../core/crm.service';
import { ClientContextService } from '../../../core/client-context.service';
import { CrmContractorComputationComponent } from './crm-contractor-computation.component';

const versionsUrl = '/api/v1/contractor-payroll/versions';
const rowsUrl = '/api/v1/crm/contractor-computation/mcd-computations';
const clients = [{ id: 'test-client-a', clientName: 'TEST ONLY A' }, { id: 'test-client-b', clientName: 'TEST ONLY B' }];
const version = (id: string) => ({ id, periodMonth: '2099-11', version: 1, status: 'SUBMITTED', branchName: 'TEST ONLY branch', contractorName: id, employeeCount: 1, grossWage: 100, netSalary: 100, exceptions: 0, allowedActions: ['approve'], canDownload: false });

afterEach(() => { TestBed.inject(HttpTestingController).verify(); TestBed.resetTestingModule(); });

async function setup(lockedClient = '') {
  const assigned = new Subject<any[]>();
  const params = convertToParamMap(lockedClient ? { clientId: lockedClient } : {});
  await TestBed.configureTestingModule({
    imports: [CrmContractorComputationComponent],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params }, paramMap: of(params) } },
      { provide: CrmService, useValue: { getAssignedClientsCached: () => assigned } },
      { provide: ClientContextService, useValue: { resolve: () => of(null) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(CrmContractorComputationComponent);
  const vm = fixture.componentInstance;
  const root = fixture.nativeElement as HTMLElement;
  const render = async () => { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await Promise.resolve(); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); };
  await render();
  const selectClient = async (id: string) => {
    const select = root.querySelector('.filters select') as HTMLSelectElement;
    select.value = id; select.dispatchEvent(new Event('change')); await render();
  };
  return { fixture, vm, root, assigned, render, selectClient, http: TestBed.inject(HttpTestingController) };
}

describe.each([390, 768, 1440])('CRM contractor payroll scope at %ipx', width => {
  beforeEach(async () => page.viewport(width, 950));

  it('waits for a selected client, including while assignments load and after clearing selection', async () => {
    const t = await setup();
    t.http.expectNone(r => r.url.endsWith(versionsUrl));
    t.assigned.next(clients); await t.render();
    expect(t.root.textContent).toContain('Select a client to view contractor computation.');
    expect(t.root.querySelector('app-contractor-payroll-workflow')).toBeNull();
    t.vm.periodMonth = '2099-11'; t.vm.load(); await t.render();
    t.http.expectNone(r => r.url.endsWith(versionsUrl) || r.url.endsWith(rowsUrl));
    await t.selectClient('test-client-a');
    const first = t.http.expectOne(r => r.url.endsWith(versionsUrl));
    expect(first.request.params.get('clientId')).toBe('test-client-a');
    expect(first.request.params.get('periodMonth')).toBe('2099-11');
    first.flush({ data: [version('synthetic-version')], hasMore: false });
    t.http.expectOne(r => r.url.endsWith(rowsUrl)).flush({ data: [{ employeeName: 'Synthetic worker', matchStatus: 'MATCHED' }] });
    await t.render();
    expect(t.root.textContent).toContain('synthetic-version');
    await t.selectClient('');
    expect(t.vm.rows).toEqual([]);
    expect(t.root.querySelector('app-contractor-payroll-workflow')).toBeNull();
    expect(t.root.textContent).not.toContain('Synthetic worker');
    t.http.expectNone(r => r.url.endsWith(versionsUrl) || r.url.endsWith(rowsUrl));
  });

  it('cancels old month/client requests and clearing a pending scope leaves no stale rows or review controls', async () => {
    const t = await setup(); t.assigned.next(clients); await t.render();
    await t.selectClient('test-client-a');
    const oldVersions = t.http.expectOne(r => r.url.endsWith(versionsUrl));
    const oldRows = t.http.expectOne(r => r.url.endsWith(rowsUrl));
    await t.selectClient('test-client-b');
    expect(oldVersions.cancelled).toBe(true); expect(oldRows.cancelled).toBe(true);
    const bVersions = t.http.expectOne(r => r.url.endsWith(versionsUrl));
    const bRows = t.http.expectOne(r => r.url.endsWith(rowsUrl));
    expect(bVersions.request.params.get('clientId')).toBe('test-client-b');
    t.vm.periodMonth = '2099-10'; t.vm.load(); await t.render();
    expect(bVersions.cancelled).toBe(true); expect(bRows.cancelled).toBe(true);
    const monthVersions = t.http.expectOne(r => r.url.endsWith(versionsUrl));
    const monthRows = t.http.expectOne(r => r.url.endsWith(rowsUrl));
    expect(monthVersions.request.params.get('periodMonth')).toBe('2099-10');
    await t.selectClient('');
    expect(monthVersions.cancelled).toBe(true); expect(monthRows.cancelled).toBe(true);
    expect(t.vm.loading).toBe(false); expect(t.vm.rows).toEqual([]);
    expect(t.root.querySelector('app-contractor-payroll-workflow')).toBeNull();
  });

  it('loads a single assigned client automatically and allows a scoped retry after a genuine failure', async () => {
    const t = await setup(); t.assigned.next([clients[0]]); await t.render();
    const first = t.http.expectOne(r => r.url.endsWith(versionsUrl));
    expect(first.request.params.get('clientId')).toBe('test-client-a');
    first.flush({ message: 'Synthetic unavailable response' }, { status: 503, statusText: 'Unavailable' });
    t.http.expectOne(r => r.url.endsWith(rowsUrl)).flush({ data: [] }); await t.render();
    expect(t.root.textContent).toContain('Synthetic unavailable response');
    (t.root.querySelector('[aria-label="Refresh approvals"]') as HTMLButtonElement).click();
    const retry = t.http.expectOne(r => r.url.endsWith(versionsUrl));
    expect(retry.request.params.get('clientId')).toBe('test-client-a');
    retry.flush({ data: [], hasMore: false }); await t.render();
    expect(t.root.textContent).not.toContain('Synthetic unavailable response');
    const filters = t.root.querySelector('.filters')!.getBoundingClientRect();
    expect(filters.left).toBeGreaterThanOrEqual(0); expect(filters.right).toBeLessThanOrEqual(width + 1);
  });
});

it('retains the client from a client-specific route and cancels reads on navigation away', async () => {
  const t = await setup('test-client-b');
  const versions = t.http.expectOne(r => r.url.endsWith(versionsUrl));
  expect(versions.request.params.get('clientId')).toBe('test-client-b');
  t.assigned.next(clients); await t.render();
  const rows = t.http.expectOne(r => r.url.endsWith(rowsUrl));
  expect(rows.request.params.get('clientId')).toBe('test-client-b');
  expect(t.root.querySelector('.filters select')?.textContent).not.toContain('Select client');
  t.fixture.destroy(); expect(versions.cancelled).toBe(true); expect(rows.cancelled).toBe(true);
});
