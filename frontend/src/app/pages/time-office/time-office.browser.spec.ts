import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { AuthService } from '../../core/auth.service';
import { TimeOfficeComponent } from './time-office.component';
import { of, Subject } from 'rxjs';

const url = '/api/v1/client/attendance/time-office';
const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="4" y="26">TEST Logo</text></svg>');
const row = { id: 'synthetic-worker', name: 'TEST ONLY Worker', employee_code: 'TEST001', worker_type: 'CONTRACTOR', contractor_name: 'TEST ONLY Vendor', branch: 'TEST ONLY Unit', status: 'PRESENT', check_in: '09:00:00', check_out: '15:00:00', worked_hours: 6, approval_status: 'RECORDED', short_hours: true };
const data = (date: string, rows: any[] = [row]) => ({ date, rows, branches: [{ id: 'unit', name: 'TEST ONLY Unit' }], contractors: [{ id: 'vendor', name: 'TEST ONLY Vendor' }], summary: { workers: rows.length, employees: 0, contractorWorkers: rows.length }, total: rows.length, pageSize: 50 });
afterEach(() => { TestBed.inject(HttpTestingController).verify(); TestBed.resetTestingModule(); vi.restoreAllMocks(); });
async function setup(profile = of({}), cachedUser: any = { name: 'Test Office', clientName: 'TEST ONLY Company', clientLogoUrl: logo }) {
  const auth = { getUser: vi.fn(() => cachedUser), authenticateUrl: vi.fn((url: string) => url), fetchMe: vi.fn(() => profile), logout: vi.fn() };
  await TestBed.configureTestingModule({imports: [TimeOfficeComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: AuthService, useValue: auth },
  ]}).compileComponents();
  const fixture = TestBed.createComponent(TimeOfficeComponent), vm = fixture.componentInstance, http = TestBed.inject(HttpTestingController);
  const render = async () => { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await Promise.resolve(); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); };
  await render();
  const first = http.expectOne(r => r.url.endsWith(url)); first.flush(data(first.request.params.get('date')!)); await render();
  const root = fixture.nativeElement as HTMLElement;
  const select = async (name: string, value: string) => { const el=root.querySelector(`[name="${name}"]`) as HTMLSelectElement; el.value=value; el.dispatchEvent(new Event('change')); await render(); };
  return {fixture,vm,http,root,render,select,auth};
}
describe.each([390,768,1440,1872])('Time Office workforce at %ipx', width => {
  beforeEach(async () => page.viewport(width,950));
  it('shows contractor attendance, shared module presentation, correct active navigation and an accessible mobile drawer', async () => {
    const t=await setup();
    expect(t.root.querySelector('ui-page-header h1')?.textContent).toContain('Workforce attendance');
    const clientLogo = t.root.querySelector('.client-logo') as HTMLImageElement;
    expect(clientLogo.src).toBe(logo);
    expect(clientLogo.alt).toBe('TEST ONLY Company logo');
    expect(clientLogo.getBoundingClientRect().height).toBe(40);
    expect(clientLogo.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    expect(t.root.querySelectorAll('nav [aria-pressed="true"]')).toHaveLength(1);
    for (const button of t.root.querySelectorAll('nav button:not(.active)')) {
      expect(button.classList.contains('sidebar-item')).toBe(true);
      expect(getComputedStyle(button).backgroundImage).toBe('none');
      expect(getComputedStyle(button).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    }
    const filters=t.root.querySelector('.filters')!;
    expect(getComputedStyle(filters).gridTemplateColumns.split(' ')).toHaveLength(width<641?1:width<1280?2:4);
    const show=filters.querySelector('[name="issue"]')!.getBoundingClientRect();
    expect(show.width).toBeGreaterThan(210);
    if(width>640) expect(Math.abs(filters.querySelector('button')!.getBoundingClientRect().bottom-show.bottom)).toBeLessThan(2);
    expect(t.root.querySelector('tbody')?.textContent).toContain('TEST ONLY Vendor');
    expect(t.root.querySelector('tbody')?.textContent).toContain('09:00:00');
    expect(t.root.querySelector('tbody')?.textContent).not.toContain('Notify employee');
    expect(t.root.querySelector('ui-stat-card')?.textContent).toContain('Total workforce');
    const sidebar=t.root.querySelector('aside') as HTMLElement;
    if(width<1024){
      expect(sidebar.inert).toBe(true);
      (t.root.querySelector('[aria-label="Open navigation"]') as HTMLButtonElement).click();await t.render();
      expect(sidebar.inert).toBe(false);expect(sidebar.getAttribute('aria-modal')).toBe('true');
      sidebar.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await t.render();
      expect(sidebar.inert).toBe(true);expect(t.vm.mobileOpen).toBe(false);
    }else expect(sidebar.inert).toBe(false);
    expect(t.root.scrollWidth).toBeLessThanOrEqual(width+1);
    expect(t.root.querySelector('main')!.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  });
  it('automatically requests the changed date and contractor scope; old responses cannot restore prior data', async () => {
    const t=await setup();
    const date=t.root.querySelector('[name="date"]') as HTMLInputElement;
    date.value='2026-01-05';date.dispatchEvent(new Event('input'));await t.render();
    const old=t.http.expectOne(r=>r.url.endsWith(url));expect(old.request.params.get('date')).toBe('2026-01-05');
    await t.select('workforce','CONTRACTOR');
    expect(old.cancelled).toBe(true);
    const current=t.http.expectOne(r=>r.url.endsWith(url));expect(current.request.params.get('workforce')).toBe('CONTRACTOR');
    current.flush(data('2026-01-05'));await t.render();
    expect(t.root.querySelector('.table-heading')?.textContent).toContain('2026-01-05');
    await t.select('contractor','vendor');const selected=t.http.expectOne(r=>r.url.endsWith(url));expect(selected.request.params.get('contractor')).toBe('vendor');selected.flush(data('2026-01-05'));await t.render();
    await t.select('branch','unit');const branch=t.http.expectOne(r=>r.url.endsWith(url));expect(branch.request.params.get('contractor')).toBe('');branch.flush(data('2026-01-05'));await t.render();
    expect(t.vm.contractor).toBe('');
  });
  it('blocks exporting and follow-ups for unapplied filters, preserves data dates, and clears failures', async () => {
    const t=await setup();
    t.vm.data.rows=[{...row,worker_type:'EMPLOYEE',status:'NOT_MARKED'}];
    t.vm.search='changed filter';await t.render();
    expect(t.root.textContent).toContain('Filters have changed');
    const exportButton=Array.from(t.root.querySelectorAll('button')).find(b=>b.textContent?.includes('Export this page'))!;
    expect(exportButton.disabled).toBe(true);
    t.vm.followUp(t.vm.data.rows[0],'EMPLOYEE');t.http.expectNone(r=>r.method==='POST');
    t.vm.load();const request=t.http.expectOne(r=>r.url.endsWith(url));
    request.flush({message:'Synthetic read failed'},{status:503,statusText:'Unavailable'});await t.render();
    expect(t.vm.data.rows).toEqual([]);expect(t.root.textContent).toContain('Synthetic read failed');
    t.vm.load();t.http.expectOne(r=>r.url.endsWith(url)).flush(data(t.vm.date));await t.render();expect(t.vm.filtersPending).toBe(false);
  });
});
it('refreshes client branding and hides failed logos without blocking attendance', async () => {
  const profile = new Subject<any>();
  const t = await setup(profile, { name: 'Test Office' });
  expect(t.root.querySelector('.client-logo')).toBeNull();
  t.auth.getUser.mockReturnValue({ name: 'Test Office', client: { name: 'TEST Refreshed Company', logoUrl: logo } });
  profile.next({}); await t.render();
  expect(t.auth.authenticateUrl).toHaveBeenCalledWith(logo);
  expect(t.root.querySelector('.account')?.textContent).toContain('TEST Refreshed Company');
  t.root.querySelector('.client-logo')!.dispatchEvent(new Event('error')); await t.render();
  expect(t.root.querySelector('.client-logo')).toBeNull();
  expect(t.root.querySelector('tbody')?.textContent).toContain('TEST ONLY Worker');
  profile.error(new Error('Synthetic profile outage')); await t.render();
  expect(t.vm.error).toBe('');
});
it('leaves and comp-off stay employee-only and navigation cancels pending attendance', async()=>{
  const t=await setup();t.vm.workforce='CONTRACTOR';t.vm.contractor='vendor';t.vm.load();const pending=t.http.expectOne(r=>r.url.endsWith(url));
  t.vm.switchView('leaves');expect(pending.cancelled).toBe(true);const leave=t.http.expectOne(r=>r.url.endsWith(url));
  expect(leave.request.params.get('workforce')).toBe('EMPLOYEE');expect(leave.request.params.get('contractor')).toBe('');leave.flush(data(t.vm.date,[]));await t.render();
  expect(t.root.textContent).toContain('client employee leave');expect(t.root.querySelector('[name="contractor"]')).toBeNull();
  t.vm.switchView('coff');t.http.expectOne(r=>r.url.endsWith(url)).flush(data(t.vm.date,[]));await t.render();expect(t.root.textContent).toContain('Comp-off balances');
});
it('exports worker type and contractor identity with the loaded date and prevents CSV formulas',async()=>{
  const t=await setup();t.vm.data.rows=[{...row,name:'=TEST ONLY formula'}];
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test-only');
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  t.vm.exportPage();
  const content=await (create.mock.calls[0][0] as Blob).text();
  expect(content).toContain('"worker_type","contractor_name"');
  expect(content).toContain('"CONTRACTOR","TEST ONLY Vendor"');
  expect(content).toContain("'=TEST ONLY formula");
  expect((click.mock.instances[0] as HTMLAnchorElement).download).toContain(t.vm.data.date);
  t.vm.search='unapplied';t.vm.exportPage();expect(create).toHaveBeenCalledTimes(1);
});
